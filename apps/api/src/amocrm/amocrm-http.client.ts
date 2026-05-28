import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { AmocrmConfig } from './amocrm.config';
import type { AmoContact, AmoCrmClient, AmoCustomFieldValue, AmoLead } from './amocrm.types';

@Injectable()
export class AmocrmHttpClient implements AmoCrmClient {
  private readonly logger = new Logger(AmocrmHttpClient.name);
  private readonly axios: AxiosInstance;

  constructor(config: AmocrmConfig) {
    this.axios = axios.create({
      baseURL: config.baseUrl.replace(/\/$/, ''),
      timeout: 10_000,
      headers: { Authorization: `Bearer ${config.accessToken}` },
    });
  }

  async getLead(id: number): Promise<AmoLead> {
    const res = await this.axios.get<AmoLead>(`/api/v4/leads/${id}`, {
      params: { with: 'contacts' },
    });
    return res.data;
  }

  async getContact(id: number): Promise<AmoContact> {
    const res = await this.axios.get<{ id: number; name?: string; custom_fields_values?: AmoCustomFieldValue[] }>(
      `/api/v4/contacts/${id}`,
    );
    const data = res.data;
    const phoneRe = /^\+?\d{10,}$/;
    let phoneValue: string | null = null;
    for (const f of data.custom_fields_values ?? []) {
      const match = f.values.find((v) => typeof v.value === 'string' && phoneRe.test(v.value));
      if (match) {
        phoneValue = match.value as string;
        break;
      }
    }
    return {
      id: data.id,
      name: data.name ?? null,
      custom_fields_values: data.custom_fields_values ?? null,
      phone: phoneValue,
    };
  }

  async patchLead(id: number, customFields: AmoCustomFieldValue[]): Promise<void> {
    await this.axios.patch(`/api/v4/leads/${id}`, { custom_fields_values: customFields });
  }

  async listLeadsUpdatedSince(since: Date): Promise<AmoLead[]> {
    const fromSec = Math.floor(since.getTime() / 1000);
    const res = await this.axios.get<{ _embedded?: { leads?: AmoLead[] } }>(`/api/v4/leads`, {
      params: { 'filter[updated_at][from]': fromSec, with: 'contacts', limit: 250 },
    });
    return res.data._embedded?.leads ?? [];
  }
}
