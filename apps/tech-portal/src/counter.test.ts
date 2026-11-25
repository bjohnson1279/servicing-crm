import { describe, it, expect } from 'vitest';
import { setupCounter } from './counter';

describe('setupCounter', () => {
  it('initializes button text to 0 and increments on click', () => {
    const button = document.createElement('button');
    setupCounter(button);
    expect(button.textContent).toBe('Count is 0');
    button.click();
    expect(button.textContent).toBe('Count is 1');
    button.click();
    expect(button.textContent).toBe('Count is 2');
  });
});
