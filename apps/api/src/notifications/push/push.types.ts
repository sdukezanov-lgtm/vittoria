export const PUSH_PROVIDER = Symbol('PUSH_PROVIDER');

export interface PushMessage {
  token: string;
  platform: 'ios' | 'android';
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface PushSendResult {
  providerMessageId: string;
}

export interface PushProvider {
  send(message: PushMessage): Promise<PushSendResult>;
}
