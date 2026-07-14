/**
 * Server-side utility to communicate with Green API.
 * Sends a WhatsApp message to the configured group chat.
 * Spec: CLAUDE.md & prompt description (Pillar 1)
 */
export async function sendWhatsAppGroupMessage(message: string): Promise<boolean> {
  const instanceId = process.env.GREEN_API_INSTANCE_ID;
  const token = process.env.GREEN_API_TOKEN;
  const chatId = process.env.WHATSAPP_GROUP_ID;

  if (!instanceId || !token || !chatId) {
    const errMsg = 'Missing Green API credentials in environment variables';
    console.error(`[whatsapp] ${errMsg}:`, {
      hasInstanceId: !!instanceId,
      hasToken: !!token,
      hasChatId: !!chatId,
    });
    throw new Error(errMsg);
  }

  const url = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`;

  console.log(`[whatsapp] Constructing payload for Green API chat ${chatId}...`);
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chatId,
      message,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    const errMsg = `Green API request failed with status ${response.status}: ${errorText}`;
    console.error(`[whatsapp] ${errMsg}`);
    throw new Error(errMsg);
  }

  const data = await response.json();
  console.log('[whatsapp] Message broadcasted successfully via Green API:', data);
  return true;
}
