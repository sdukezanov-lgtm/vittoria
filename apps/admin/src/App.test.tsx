import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import App from './App';

describe('App', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('shows the login screen when unauthenticated', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText('VITTORIA')).toBeInTheDocument());
    expect(screen.getByLabelText(/телефон/i)).toBeInTheDocument();
  });
});
