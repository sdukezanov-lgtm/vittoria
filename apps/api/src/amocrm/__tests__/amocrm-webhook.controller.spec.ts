import { AmocrmWebhookController } from '../amocrm-webhook.controller';

// Minimal stubs for the queue + idempotency dependencies.
const makeDeps = (markIfNew = true) => {
  const added: Array<{ name: string; data: { kind: string; entityId: number; eventId: string }; opts: { jobId: string } }> = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const queue = { add: jest.fn(async (name: string, data: any, opts: any) => { added.push({ name, data, opts }); }) } as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const idempotency = { markIfNew: jest.fn(async () => markIfNew) } as any;
  return { queue, idempotency, added };
};

describe('AmocrmWebhookController', () => {
  it('extracts lead ids from amoCRM add/update/status form payload and enqueues lead.update (deduped)', async () => {
    const { queue, idempotency, added } = makeDeps();
    const ctrl = new AmocrmWebhookController(queue, idempotency);

    // amoCRM sends application/x-www-form-urlencoded; express(extended) parses
    // `leads[status][0][id]=24484437` into an array of objects (values are strings).
    const body = {
      leads: {
        status: [{ id: '24484437', status_id: '86164758', pipeline_id: '10959102' }],
        update: [{ id: '24484437' }], // same lead -> must be deduped
        add: [{ id: '555' }],
      },
    };

    const res = await ctrl.receive(body as never);

    expect(res).toEqual({ accepted: 2 }); // 24484437 (once) + 555
    const ids = added.map((a) => a.data.entityId).sort((x, y) => x - y);
    expect(ids).toEqual([555, 24484437]);
    expect(added.every((a) => a.data.kind === 'lead.update')).toBe(true);
    // Each job is keyed by its idempotency eventId.
    expect(added.every((a) => a.opts.jobId === a.data.eventId)).toBe(true);
  });

  it('also handles the object-of-index shape (qs arrayLimit fallback)', async () => {
    const { queue, added } = makeDeps();
    const idem = { markIfNew: jest.fn(async () => true) } as never;
    const ctrl = new AmocrmWebhookController(queue, idem);

    const body = { leads: { update: { '0': { id: '777' }, '1': { id: '888' } } } };
    const res = await ctrl.receive(body as never);

    expect(res).toEqual({ accepted: 2 });
    expect(added.map((a) => a.data.entityId).sort((x, y) => x - y)).toEqual([777, 888]);
  });

  it('skips already-seen events via idempotency', async () => {
    const { queue, idempotency } = makeDeps(false); // markIfNew -> false (seen)
    const ctrl = new AmocrmWebhookController(queue, idempotency);
    const res = await ctrl.receive({ leads: { update: [{ id: '1' }] } } as never);
    expect(res).toEqual({ accepted: 0 });
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('returns accepted:0 (no throw) for empty, contact-only, or malformed payloads', async () => {
    const { queue, idempotency } = makeDeps();
    const ctrl = new AmocrmWebhookController(queue, idempotency);
    expect(await ctrl.receive({} as never)).toEqual({ accepted: 0 });
    expect(await ctrl.receive({ contacts: { update: [{ id: '1' }] } } as never)).toEqual({ accepted: 0 });
    expect(await ctrl.receive({ leads: { update: [{ nope: 'x' }, 'garbage', null] } } as never)).toEqual({ accepted: 0 });
    expect(queue.add).not.toHaveBeenCalled();
  });
});
