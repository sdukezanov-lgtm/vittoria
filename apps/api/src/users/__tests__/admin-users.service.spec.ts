import { AdminUsersService } from '../admin-users.service';

describe('AdminUsersService.createUser', () => {
  const makePrisma = (overrides: Record<string, unknown> = {}) => ({
    user: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(async ({ data }) => ({
        id: 'u-new',
        phone: data.phone,
        role: data.role,
        firstName: data.firstName ?? null,
        lastName: data.lastName ?? null,
        createdAt: new Date(),
      })),
    },
    ...overrides,
  });

  it('creates an admin user', async () => {
    const prisma = makePrisma();
    const svc = new AdminUsersService(prisma as never);
    const u = await svc.createUser({ phone: '+79990000001', role: 'admin', first_name: 'A', last_name: 'B' });
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: { phone: '+79990000001', role: 'admin', firstName: 'A', lastName: 'B' },
    });
    expect(u.id).toBe('u-new');
  });

  it('throws ConflictException when phone already exists', async () => {
    const prisma = makePrisma({
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'existing' }),
        create: jest.fn(),
      },
    });
    const svc = new AdminUsersService(prisma as never);
    await expect(
      svc.createUser({ phone: '+79990000001', role: 'partner' }),
    ).rejects.toMatchObject({ status: 409 });
    expect(prisma.user.create).not.toHaveBeenCalled();
  });
});

describe('AdminUsersService.listUsers', () => {
  it('filters by role and paginates', async () => {
    const prisma = {
      user: {
        findMany: jest.fn().mockResolvedValue([{ id: 'u1' }]),
        count: jest.fn().mockResolvedValue(1),
      },
    };
    const svc = new AdminUsersService(prisma as never);
    const res = await svc.listUsers({ role: 'partner', page: 2, page_size: 10 });
    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { role: 'partner' },
      skip: 10,
      take: 10,
      orderBy: { createdAt: 'desc' },
    }));
    expect(res.total).toBe(1);
    expect(res.page).toBe(2);
    expect(res.page_size).toBe(10);
  });

  it('lists all roles when no filter', async () => {
    const prisma = {
      user: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const svc = new AdminUsersService(prisma as never);
    await svc.listUsers({});
    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {},
      skip: 0,
      take: 20,
    }));
  });
});
