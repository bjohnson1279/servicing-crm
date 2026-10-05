// Skeleton test for SignatureCapture component
import { render } from '@testing-library/react';
import { SignatureCapture } from '../SignatureCapture';

// Mock the heavy signature canvas library – it isn’t needed for a shallow render
jest.mock('react-signature-canvas', () => ({ default: (props) => <div {...props}>SignatureCanvas Mock</div> }));

test('renders SignatureCapture without crashing', () => {
  const { container } = render(<SignatureCapture />);
  expect(container).toBeDefined();
});
