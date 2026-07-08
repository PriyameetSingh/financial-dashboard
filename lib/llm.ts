export async function callLocalLLM(prompt: string): Promise<string> {
  const url = process.env.LLM_API_URL;
  const key = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL || "qwen3-30b-a3b-instruct";

  if (!url) {
    throw new Error("LLM_API_URL is not configured in environment variables.");
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(key ? { "X-API-Key": key } : {}),
    },
    body: JSON.stringify({
      model,
      provider: process.env.LLM_PROVIDER || "airawat",
      messages: [
        {
          role: "system",
          content: "You are a senior financial analyst and administrative advisor for the Housing and Urban Development Department (HUDD). Generate short, highly specific, and actionable administrative alerts based on the provided department metrics. Return only JSON data."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`LLM API failed with status ${response.status}: ${errorBody}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}
