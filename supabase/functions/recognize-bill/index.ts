const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

function extractOutputText(response) {
  if (typeof response.output_text === "string") return response.output_text;
  for (const item of response.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && typeof content.text === "string") return content.text;
    }
  }
  return "";
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!request.headers.get("Authorization")) return json({ error: "请先登录" }, 401);

  try {
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) return json({ error: "账单识别服务尚未配置" }, 503);

    const body = await request.json();
    const image = typeof body.image === "string" ? body.image : "";
    const mimeType = typeof body.mime_type === "string" ? body.mime_type : "";
    if (!image || !/^image\/(jpeg|png|webp|gif)$/.test(mimeType)) return json({ error: "图片数据无效" }, 400);
    if (image.length > 11_000_000) return json({ error: "图片过大，请压缩后重试" }, 413);

    const today = new Date().toISOString().slice(0, 10);
    const prompt = [
      "识别这张中国网贷或消费分期账单截图。",
      "只提取图片中明确可见的分期信息，不要编造金额。金额统一为人民币元的数字。",
      "每一期需包含期数、YYYY-MM-DD 格式还款日期、金额和简短备注。",
      `今天是 ${today}。如果截图没有年份，可推断距离今天最近的合理日期，但必须在 warnings 中说明。`,
      "如果文字模糊、金额合计不一致或日期无法确认，也写入 warnings。",
    ].join("\n");

    const openAIResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: Deno.env.get("OPENAI_VISION_MODEL") || "gpt-5.5",
        input: [{
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            { type: "input_image", image_url: `data:${mimeType};base64,${image}`, detail: "high" },
          ],
        }],
        text: {
          format: {
            type: "json_schema",
            name: "installment_bill",
            strict: true,
            schema: {
              type: "object",
              properties: {
                platform: { type: "string" },
                currency: { type: "string" },
                total_estimated: { type: "number" },
                installments: {
                  type: "array",
                  maxItems: 60,
                  items: {
                    type: "object",
                    properties: {
                      period: { type: "string" },
                      due_date: { type: "string" },
                      amount: { type: "number" },
                      note: { type: "string" },
                    },
                    required: ["period", "due_date", "amount", "note"],
                    additionalProperties: false,
                  },
                },
                warnings: { type: "array", items: { type: "string" } },
              },
              required: ["platform", "currency", "total_estimated", "installments", "warnings"],
              additionalProperties: false,
            },
          },
        },
        max_output_tokens: 2500,
      }),
    });

    const openAIData = await openAIResponse.json();
    if (!openAIResponse.ok) {
      console.error("OpenAI response error", openAIResponse.status, openAIData?.error?.message);
      return json({ error: "账单识别暂时失败，请稍后重试" }, 502);
    }

    const outputText = extractOutputText(openAIData);
    if (!outputText) return json({ error: "未获得识别结果，请换一张清晰截图" }, 422);
    const result = JSON.parse(outputText);
    return json({ result });
  } catch (error) {
    console.error("recognize-bill error", error);
    return json({ error: "识别过程中发生错误，请重试" }, 500);
  }
});
