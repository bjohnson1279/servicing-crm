import React from 'react';
import { vi, test, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SignatureCapture } from '../SignatureCapture';

// Mock the heavy signature canvas library – it isn't needed for a shallow render
vi.mock('react-signature-canvas', () => ({
  default: (props: any) => <div {...props}>SignatureCanvas Mock</div>,
}));

test('renders SignatureCapture without crashing', () => {
  const { container } = render(
    <MemoryRouter>
      <SignatureCapture />
    </MemoryRouter>
  );
  expect(container).toBeDefined();
});
