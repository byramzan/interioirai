import { ImageData } from "../types";

const KIE_API_BASE = "https://api.kie.ai";
const KIE_API_KEY = process.env.KIE_API_KEY as string;

interface KieCreateTaskResponse {
  code: number;
  message: string;
  data: {
    taskId: string;
    // sync mode fields
    output?: {
      image_urls?: string[];
      image_base64?: string[];
    };
  };
}

interface KieRecordInfoResponse {
  code: number;
  message: string;
  data: {
    status: string; // "pending" | "processing" | "completed" | "failed"
    output?: {
      image_urls?: string[];
      image_base64?: string[];
    };
  };
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Poll for task completion
 */
async function pollTaskResult(taskId: string, maxAttempts = 60): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    await delay(2000);

    const response = await fetch(`${KIE_API_BASE}/api/v1/jobs/recordInfo?taskId=${taskId}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${KIE_API_KEY}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Kie.ai polling error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    console.log(`Polling task ${taskId} (attempt ${i+1}):`, JSON.stringify(result, null, 2));
    
    // Some APIs use data.status, others result.status or data.state
    const status = result.data?.status || result.status || result.data?.state || result.state;
    let output = result.data?.output || result.output;

    // The result might be stored as a string in resultJson
    if (!output && typeof result.data?.resultJson === 'string' && result.data.resultJson.trim() !== '') {
       try {
         output = JSON.parse(result.data.resultJson);
       } catch (e) {
         console.warn("Could not parse resultJson", e);
       }
    }

    if (status === "failed" || status === "FAILED" || status === -1 || status === "error") {
      throw new Error(`Задача завершилась с ошибкой на стороне Kie.ai: ${JSON.stringify(result)}`);
    }

    if ((status === "completed" || status === "success" || status === "SUCCESS" || status === "finished" || status === 1 || status === "succeeded") && output) {
      console.log("Task completed! Final output object:", output);
      
      // Prefer base64 output
      if (output.image_base64 && output.image_base64.length > 0) {
        const b64 = output.image_base64[0];
        if (b64.startsWith("data:")) return b64;
        return `data:image/png;base64,${b64}`;
      }
      
      // Look for any possible URL field
      const urlMatches = [
        ...(output.resultUrls || []),
        ...(output.image_urls || []),
        ...(output.images || []),
        output.image_url,
        output.url,
        output.image
      ].filter(u => typeof u === 'string' && u.startsWith('http'));

      if (urlMatches.length > 0) {
        return urlMatches[0];
      }
      
      throw new Error(`Kie.ai вернул успешный статус, но я не нашел ссылку на картинку в ответе: ${JSON.stringify(output)}`);
    }
  }

  throw new Error("Превышено время ожидания генерации (2 мин)");
}

/**
 * Upload image to Kie.ai to get a public URL
 */
async function uploadImageToKie(imageData: ImageData): Promise<string> {
  const base64Content = imageData.base64.includes(',') ? imageData.base64.split(',')[1] : imageData.base64;
  const byteCharacters = atob(base64Content);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], {type: imageData.mimeType});

  const formData = new FormData();
  formData.append('file', blob, 'image.png');

  // Try standard upload endpoint first (OpenAI compatible)
  const response = await fetch(`${KIE_API_BASE}/v1/files`, {
    method: 'POST',
    headers: {
      "Authorization": `Bearer ${KIE_API_KEY}`
    },
    body: formData
  });

  if (!response.ok) {
     const errorText1 = await response.text();
     console.error("Upload /v1/files error:", errorText1);
     
     // Fallback to redpanda upload API found in docs, trying different field names
     const fbRes = await fetch("https://kieai.redpandaai.co/api/file-base64-upload", {
       method: 'POST',
       headers: {
         "Authorization": `Bearer ${KIE_API_KEY}`,
         "Content-Type": "application/json"
       },
       // The error says: "Missing required parameter: uploadPath (upload path)"
       body: JSON.stringify({ 
         base64Data: `data:${imageData.mimeType};base64,${base64Content}`,
         uploadPath: "interiorai" // or "uploads", whatever string it accepts
       })
     });
     
     if (!fbRes.ok) {
       const errText2 = await fbRes.text();
       console.error("Fallback upload error:", errText2);
       throw new Error(`Не удалось загрузить изображение. /v1/files: ${response.status}. Fallback: ${fbRes.status} ${errText2}`);
     }
     
     const fbData = await fbRes.json();
     console.log("Fallback upload result:", fbData);
     // Redpanda API might return { data: "url" } or { data: { downloadUrl: "url" } }
     const url = fbData.url || fbData.data?.url || fbData.data?.downloadUrl || (typeof fbData.data === 'string' ? fbData.data : null);
     if (typeof url !== 'string') {
        throw new Error(`Не удалось извлечь URL из ответа Redpanda: ${JSON.stringify(fbData)}`);
     }
     return url;
  }

  const result = await response.json();
  console.log("Upload result:", result);
  const url = result.url || result.data?.url || result.file_url || (typeof result.data === 'string' ? result.data : null);
  if (typeof url !== 'string') {
     throw new Error(`Не удалось извлечь URL из ответа Kie.ai: ${JSON.stringify(result)}`);
  }
  return url;
}

export const generateInteriorDesign = async (
  image: ImageData,
  prompt: string
): Promise<string> => {
  try {
    // 1. Upload image to get URL
    const uploadedUrl = await uploadImageToKie(image);
    console.log("Uploaded image URL:", uploadedUrl);
    const body = {
      model: "nano-banana-2",
      input: {
        prompt: `Выполните редактирование изображения в соответствии со следующей инструкцией: ${prompt}. Действуйте как профессиональный дизайнер интерьеров, но также выполняйте общие запросы по редактированию (например, удаление объектов, изменение стиля), если об этом попросят. Верните только изображение.`,
        image_input: [uploadedUrl],
        aspect_ratio: "auto",
        resolution: "1K",
        output_format: "png",
        enable_base64_output: true,
      },
    };

    const response = await fetch(`${KIE_API_BASE}/api/v1/jobs/createTask`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${KIE_API_KEY}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Kie.ai API error: ${response.status} — ${errorText}`);
    }

    const result = await response.json();
    console.log("Kie.ai raw response:", JSON.stringify(result, null, 2));

    // Check for error in various response formats
    const code = result.code ?? result.status_code ?? result.status;
    const message = result.message ?? result.msg ?? result.error ?? JSON.stringify(result);
    
    if (code !== undefined && code !== 200 && code !== 0 && code !== "success") {
      throw new Error(`Kie.ai error (code ${code}): ${message}`);
    }

    const data = result.data ?? result;

    // Check if sync mode returned result directly
    const output = data.output ?? data.result ?? data;
    if (output) {
      const base64Arr = output.image_base64 ?? output.images_base64 ?? output.base64;
      if (Array.isArray(base64Arr) && base64Arr.length > 0) {
        const b64 = base64Arr[0];
        if (b64.startsWith("data:")) return b64;
        return `data:image/png;base64,${b64}`;
      }
      const urlArr = output.image_urls ?? output.images ?? output.urls;
      if (Array.isArray(urlArr) && urlArr.length > 0) {
        return urlArr[0];
      }
    }

    // Async mode — poll for result
    const taskId = data.taskId ?? data.task_id ?? data.id;
    if (taskId) {
      return await pollTaskResult(taskId);
    }

    throw new Error("Модель не сгенерировала изображение.");
  } catch (error) {
    console.error("Kie.ai API Error:", error);
    throw error;
  }
};