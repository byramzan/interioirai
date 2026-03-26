import { GoogleGenAI } from "@google/genai";
import { ImageData } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateInteriorDesign = async (
  image: ImageData,
  prompt: string
): Promise<string> => {
  try {
    // Clean the base64 string to remove the data URL prefix if present
    const base64Data = image.base64.split(',')[1] || image.base64;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          {
            inlineData: {
              data: base64Data,
              mimeType: image.mimeType,
            },
          },
          {
            text: `Выполните редактирование изображения в соответствии со следующей инструкцией: ${prompt}. Действуйте как профессиональный дизайнер интерьеров, но также выполняйте общие запросы по редактированию (например, удаление объектов, изменение стиля), если об этом попросят. Верните только изображение.`,
          },
        ],
      },
    });

    // Iterate through parts to find the image part
    if (response.candidates && response.candidates[0].content.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          const base64EncodeString: string = part.inlineData.data;
          // Determine mime type from response or default to png
          const mimeType = part.inlineData.mimeType || 'image/png';
          return `data:${mimeType};base64,${base64EncodeString}`;
        }
      }
    }

    throw new Error("Модель не сгенерировала изображение.");
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};