import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { RoleHome } from './RoleHome';

vi.mock('./useAuth', () => ({ useAuth: () => ({ status: 'authenticated', user: { role: 'client' } }) }));

it('redirects a client to the cabinet', () => {
  render(<MemoryRouter initialEntries={['/']}>
    <Routes>
      <Route path="/" element={<RoleHome />} />
      <Route path="/cabinet" element={<div>cabinet</div>} />
    </Routes>
  </MemoryRouter>);
  expect(screen.getByText('cabinet')).toBeInTheDocument();
});
