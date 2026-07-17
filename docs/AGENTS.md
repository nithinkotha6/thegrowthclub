<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Fisky Banter Engine & Webhook Architecture Guide

`Fisky` is a custom-built, highly satirical, rage-baiting instigator and flirting AI bot designed for "The Growth Club" WhatsApp group chat. This document serves as the master guide for the system architecture, webhook ingestion pipelines, prompting mechanics, and response lifecycles.

---

## 1. System Sequence Diagram

The following Mermaid sequence diagram illustrates the lifecycle of a message from the user's phone to the AI engine, database, and back to the group chat.

```mermaid
%%{init: { 'theme': 'base', 'themeVariables': { 'primaryColor': '#83a3c3ff', 'primaryTextColor': '#253a6bff', 'lineColor': '#64748B', 'actorBkg': '#e9eef4ff', 'actorBorder': '#475569', 'actorTextColor': '#0F172A', 'signalColor': '#0284C7', 'signalTextColor': '#0284C7', 'noteBkgColor': '#FEF08A', 'noteTextColor': '#854D0E', 'rectBkgColor': '#deeae1ff', 'rectBorderColor': '#86EFAC' }}}%%
sequenceDiagram
    autonumber
    actor User as "WhatsApp User"
    participant Green as "GreenAPI Gateway"
    participant Webhook as "Webhook Route (route.ts)"
    participant DB as "Supabase Database"
    participant Gemini as "Google Gemini LLM"
    
    User->>Green: Sends WhatsApp message in group
    Green->>Webhook: HTTP POST Webhook incomingMessageReceived
    Note over Webhook: Validate Instance ID and Group ID<br/>Return 200 OK immediately to GreenAPI
    
    rect rgb(240, 248, 255)
        Note over Webhook: Background Worker after or waitUntil
        Webhook->>DB: Query User Profile by clean phone number
        DB-->>Webhook: Return Sender Nickname and Gender
        
        Webhook->>DB: Query Chat History of last 3 messages
        DB-->>Webhook: Return chronologically sorted history
        
        Webhook->>DB: Query 5 Recent Verified Activity Logs
        DB-->>Webhook: Return recent logs list
        
        Webhook->>DB: Query Leaderboard logs for top_golf
        DB-->>Webhook: Return athlete standings data
        
        Note over Webhook: Build Prompt and Select Flirting Style<br/>10% chance to trigger Coach Interruption Phrase
        
        Webhook->>Gemini: Call LLM with System prompt, History, and Context
        Gemini-->>Webhook: Return raw plain text response without Markdown
        
        Webhook->>Green: HTTP POST sendMessage with quotedMessageId
        Green->>User: Deliver quoted reply message to Group
        
        Webhook->>DB: Save User and Assistant logs to chat_history
    end
``` 

---

## 2. End-to-End Visual Ingestion Flowchart

The following flowchart outlines the logic branches, validation checks, database joins, and asynchronous workers involved in the webhook lifecycle.

```mermaid
%%{init: { 'theme': 'base', 'themeVariables': { 'primaryColor': '#F8FAFC', 'primaryTextColor': '#1b2b50ff', 'edgeLabelBackground': '#FFFFFF', 'lineColor': '#64748B' }}}%%
graph TD
    classDef startEnd fill:#F1F5F9,stroke:#475569,stroke-width:2px,color:#0F172A;
    classDef process fill:#E0F2FE,stroke:#0284C7,stroke-width:1.5px,color:#0369A1;
    classDef decision fill:#F3E8FF,stroke:#7C3AED,stroke-width:1.5px,color:#6D28D9;
    classDef database fill:#FEF3C7,stroke:#D97706,stroke-width:1.5px,color:#B45309;
    classDef api fill:#ECFDF5,stroke:#059669,stroke-width:1.5px,color:#047857;

    Start(["WhatsApp Message Received"]) --> Ingestion["1. Inbound Webhook Payload Ingested"]
    Ingestion --> CheckMute{"Is Bot Muted?"}
    
    CheckMute -- "Yes" --> TerminateMuted(["Halt and Return 200 OK"])
    CheckMute -- "No" --> VerifyInst{"Verify GreenAPI Instance ID"}
    
    VerifyInst -- "No" --> TerminateInst(["Halt and Return 200 OK"])
    VerifyInst -- "Yes" --> VerifyChat{"Verify Chat ID and Msg Type"}
    
    VerifyChat -- "No" --> TerminateChat(["Halt and Ignore Payload"])
    VerifyChat -- "Yes" --> CheckCmd{"Is Message /clear?"}
    
    CheckCmd -- "Yes" --> ClearMemory["Wipe Chat History in DB"]
    ClearMemory --> SendClear["Send Clear Confirmation Message"]
    SendClear --> EndClear(["End Request"])
    
    CheckCmd -- "No" --> ForkWorker["2. Return 200 OK and Fork Background Worker"]
    
    subgraph BackgroundWorker["Asynchronous Background Ingestion Process"]
        ForkWorker --> FetchProfile[("Query Sender Profile")]
        FetchProfile --> ResolveGender{"Resolve Gender Style"}
        
        ResolveGender -- "Male" --> SetFemale["Set Tollywood Female Persona"]
        ResolveGender -- "Female" --> SetSigma["Set Sigma Male Persona"]
        ResolveGender -- "Unknown" --> SetSassy["Set Sassy Instigator Persona"]
        
        SetFemale --> FetchContext[("Query Last 3 Chats and Activities")]
        SetSigma --> FetchContext
        SetSassy --> FetchContext
        
        FetchContext --> Interruption{"10% Coach Interruption Chance?"}
        Interruption -- "Yes" --> InjectCoach["Inject Coach Telugu Phrase"]
        Interruption -- "No" --> BuildPrompt["Build LLM System Instructions"]
        InjectCoach --> BuildPrompt
        
        BuildPrompt --> CallGemini[["3. Query Gemini LLM with Key Rotation"]]
        CallGemini --> SendMsg[["4. Dispatch Quoted Response via GreenAPI"]]
        SendMsg --> LogConv[("Write Chat Logs to Database")]
        LogConv --> WorkerDone(["Background Ingestion Done"])
    end
    
    class Start,TerminateMuted,TerminateInst,TerminateChat,EndClear,WorkerDone startEnd;
    class Ingestion,ClearMemory,SendClear,SetFemale,SetSigma,SetSassy,InjectCoach,BuildPrompt process;
    class CheckMute,VerifyInst,VerifyChat,CheckCmd,ResolveGender,Interruption decision;
    class FetchProfile,FetchContext,LogConv database;
    class CallGemini,SendMsg api;
```

---

## 3. Inbound Webhook Ingestion

GreenAPI forwards incoming messages to our webhook endpoint at `/api/webhooks/whatsapp`.

### Inbound Payload Format
A typical webhook payload for `incomingMessageReceived` looks as follows:

```json
{
  "typeWebhook": "incomingMessageReceived",
  "instanceData": {
    "idInstance": 1234567890,
    "wid": "1234567890@c.us"
  },
  "timestamp": 1783832100,
  "idMessage": "XYZ1234567890ABCDEF",
  "senderData": {
    "chatId": "12036304381920@g.us",
    "chatName": "The Growth Club",
    "sender": "919995551234@c.us",
    "senderName": "Nithin"
  },
  "messageData": {
    "typeMessage": "extendedTextMessage",
    "extendedTextMessageData": {
      "text": "Where should I come for the run today?"
    }
  }
}
```

### Pre-Flight Verification & Safety Guards
1. **Mute Switch:** Checks the `system_settings` table where `key = 'bot_muted'`. If `value` is `'true'`, the webhook logs the event and terminates with `200 OK`.
2. **Instance Validation:** Verifies `instanceData.idInstance` matches `process.env.GREEN_API_INSTANCE_ID` using a constant-time safe comparison. Unmatched instances receive a `200 OK` early return to prevent unauthenticated payloads.
3. **Chat Scope Guard:** Inspects `senderData.chatId` to guarantee it matches `process.env.WHATSAPP_GROUP_ID`.
4. **Message Type Filter:** Only processes messages where `typeMessage` is `textMessage` or `extendedTextMessage`. All other payload events are acknowledged and ignored.

---

## 4. Context Processing & Profile Mapping

Once verified, the webhook triggers an asynchronous worker execution using Next.js `after(...)` block to keep client response times fast.

### Clean Phone Matching
The webhook parses the sender's phone number from `senderData.sender` (extracting the text before the `@` symbol, e.g., `"919995551234"`). It queries the `profiles` table to fetch the sender's details defensively:
```sql
SELECT nickname, gender 
  FROM public.profiles 
 WHERE phone_number = '+919995551234' 
    OR phone_number = '919995551234' 
    OR phone_number LIKE '%919995551234%' 
 LIMIT 1;
```

### Context & Token Clamping
To prevent token bloat, session drift, and hallucinations, the chat history context retrieved from the `chat_history` database table is strictly capped:
* **Token Clamp:** Retreives only the **last 3 messages** from the database.
* **Session Inactivity Check:** If the duration between the current message and the most recent record in `chat_history` exceeds **30 minutes**, the history is flushed, initializing a fresh topic context.

---

## 5. Prompt Engineering & Conditional Flirting

The system prompt is dynamically assembled on the server. The target sender's gender is passed into `buildGroupAssistantPrompt` to determine the flirting vibe.

### DYNAMIC PERSONA & FLIRTING MATRIX

| Sender Gender | Bot Persona Style | Tone/Behavior |
| :--- | :--- | :--- |
| **Male** | Tollywood Dramatic Female | Flirts aggressively, uses cheesy/cute Telugu pickup lines, displays dramatic possessiveness, and teases relentlessly. |
| **Female** | Sigma Male | Flirts smoothly, adopts an ultra-confident, slightly arrogant, nonchalant tone, playing hard to get. |
| **Gay / Unknown** | Sassy Instigator | Employs heavy sass, dramatic compliments, and playful friend-group roasting. |

### Strict Linguistic Directives
1. **Language:** Speaks in conversational Romanized Telugu (Telugu words spelled out in the English alphabet, e.g. `"Orey", "enti bro", "em chestunnav"`) blended with Gen-Z English slang. Telugu script (తెలుగు characters) is strictly forbidden.
2. **Context Priority & Question Answering:** If the user asks a question or requests directions/time (e.g. `"Where should I come?"`), the bot must answer the question directly and accurately based on context or general logic. It is forbidden from evading or ignoring user inquiries.
3. **Anti-Repetition Loop Guard:** Banned from starting every message with `"[Name] darling"` or repeating `"darling"` continuously. Vocabulary must dynamically rotate.
4. **Anti-Movie Repetitions:** Banned from repeating clichéd references to *Pushpa*, *RRR*, or *Baahubali*. Prompt directs rotation through trending Instagram meme humor.
5. **No Markdown:** Prohibited from using markdown indicators (`*`, `_`, `~`) to ensure clean, readable text outputs on mobile screens.

---

## 6. Outbound Communication Invocations

When the LLM response is returned, the webhook calls the GreenAPI outbound messenger:

### Quoted Reply Delivery
The API endpoint `/sendMessage/` is invoked. By passing the inbound payload's `idMessage` to the `quotedMessageId` parameter, the bot's message is delivered to the group chat as a direct quoted reply to the trigger message.

**GreenAPI HTTP Request Payload:**
* **URL:** `https://api.green-api.com/waInstance{{INSTANCE_ID}}/sendMessage/{{TOKEN}}`
* **Method:** `POST`
* **Body:**
```json
{
  "chatId": "12036304381920@g.us",
  "message": "Nenu me fitness coach la undham anukunte... meru nannu group lo petti football aadukuntunnaru ga! Anyway, Jubilee Hills main road degariki ochey.",
  "quotedMessageId": "XYZ1234567890ABCDEF"
}
```

---

## 7. Parameters & Safety Configurations

* **LLM Model:** Google Gemini models (managed under `GeminiPool` key rotation).
* **Timeout Limits:** `maxDuration = 60` seconds.
* **Word Limit:** Dynamically calculated based on user message length: `Math.max(15, incomingWordCount * 3)`.
* **Coach Phrase Frequency:** The probability of inserting the coach phrase `"Nenu me fitness coach la undham anukunte..."` is capped at exactly **10%** (`Math.random() < 0.10`).
