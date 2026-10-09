// Skeleton test for SignatureCapture component
import { render } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { SignatureCapture } from '../SignatureCapture';

// Mock the heavy signature canvas library – it isn’t needed for a shallow render
vi.mock('react-signature-canvas', () => ({ default: (props) => <div {...props}>SignatureCanvas Mock</div> }));

test('renders SignatureCapture without crashing', () => {
  const { container } = render(
    <BrowserRouter>
      <SignatureCapture />
    </BrowserRouter>
  );
  expect(container).toBeDefined();
});
