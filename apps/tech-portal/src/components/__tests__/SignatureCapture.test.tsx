// Skeleton test for SignatureCapture component
import { render } from '@testing-library/react';
import { SignatureCapture } from '../SignatureCapture';
import { vi } from 'vitest';

// Mock the heavy signature canvas library – it isn’t needed for a shallow render
vi.mock('react-signature-canvas', () => ({ default: (props: any) => <div {...props}>SignatureCanvas Mock</div> }));

test('renders SignatureCapture without crashing', () => {
  const { container } = render(<SignatureCapture />);
  expect(container).toBeDefined();
});
