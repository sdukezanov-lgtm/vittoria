export const SMS_PROVIDER = Symbol('SMS_PROVIDER');

export interface SmsMessage {
  to: string;
  text: string;
}

export interface SmsSendResult {
  providerMessageId: string;
}

export interface SmsProvider {
  send(message: SmsMessage): Promise<SmsSendResult>;
}
