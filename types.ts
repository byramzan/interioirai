export const AppState = {
  IDLE: 'IDLE',
  CHAT: 'CHAT',
  ERROR: 'ERROR'
} as const;

export type AppState = typeof AppState[keyof typeof AppState];

export interface ImageData {
  base64: string;
  mimeType: string;
}

export type MessageRole = 'user' | 'assistant';

export interface Message {
  id: string;
  role: MessageRole;
  text?: string;
  image?: ImageData;
  isLoading?: boolean;
}

export interface GenerationResult {
  original: ImageData;
  generated: string; // Base64 url
  prompt: string;
}