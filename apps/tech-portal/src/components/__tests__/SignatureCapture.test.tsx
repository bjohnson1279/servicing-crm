// Skeleton test for SignatureCapture component
import { render } from '@testing-library/react';
import { SignatureCapture } from '../SignatureCapture';
import { MemoryRouter } from 'react-router-dom';

// Mock the heavy signature canvas library – it isn’t needed for a shallow render
vi.mock('react-signature-canvas', () => ({ default: (props) => <div {...props}>SignatureCanvas Mock</div> }));

test('renders SignatureCapture without crashing', () => {
  const { container } = render(
    <MemoryRouter>
      <SignatureCapture />
    </MemoryRouter>
  );
  expect(container).toBeDefined();
});
