// Skeleton test for ChemicalLog component
import { render } from '@testing-library/react';
import ChemicalLog from '../ChemicalLog';

import { MemoryRouter } from 'react-router-dom';

test('renders ChemicalLog without crashing', () => {
  const { container } = render(
    <MemoryRouter>
      <ChemicalLog />
    </MemoryRouter>
  );
  expect(container).toBeDefined();
});
