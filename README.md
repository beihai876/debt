# debt

单页债务记录工具，数据存储在 Supabase。

## 账单截图识别

网贷债务支持上传账单截图，通过 Supabase Edge Function 调用 OpenAI 图片识别，并在人工确认后保存分期数据。截图本身不会写入数据库。

部署识别函数前需要安装 Supabase CLI，然后执行：

```powershell
supabase login
supabase link --project-ref iqxafcpciutvudqbgozd
supabase secrets set OPENAI_API_KEY=你的密钥
supabase functions deploy recognize-bill
```

函数默认使用 `gpt-5.5`。如需更换支持图片输入的模型，可设置 `OPENAI_VISION_MODEL`：

```powershell
supabase secrets set OPENAI_VISION_MODEL=模型名称
```
