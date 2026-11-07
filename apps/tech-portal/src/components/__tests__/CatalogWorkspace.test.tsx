import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CatalogWorkspace from '../catalog/CatalogWorkspace';
import { catalogApi, catalogToken, CatalogError, CatalogProduct } from '../catalog/catalogApi';

vi.mock('../catalog/catalogApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../catalog/catalogApi')>();
  return {
    ...actual,
    catalogApi: vi.fn(),
    catalogToken: vi.fn(),
  };
});

describe('CatalogWorkspace Component', () => {
  const mockToken = 'mock-access-token';

  const mockProduct: CatalogProduct = {
    id: 'prod-1',
    code: 'CHEM-001',
    versions: [
      {
        revision: 1,
        status: 'draft',
        version: 1,
        data: {
          trade_name: 'Permethrin Pro',
          manufacturer: 'EcoPest Inc.',
          category: 'pesticide',
          jurisdiction: 'EPA',
          identifier_status: 'known',
          identifier_type: 'EPA_REG',
          identifier_value: '12345-67',
          identifier_reason: '',
          label_required: true,
          sds_required: true,
          document_exception: '',
          inventory_item_id: null,
        },
        documents: [],
      },
    ],
    events: [
      {
        id: 'evt-1',
        action: 'create_draft',
        reason: 'Initial onboarding',
        created_at: '2026-01-01T00:00:00Z',
      },
    ],
  };

  const mockOptions = [
    { id: 'inv-1', name: 'Permethrin 10%', sku: 'SKU-P10' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(catalogToken).mockReturnValue(mockToken);
    globalThis.crypto.randomUUID = vi.fn().mockReturnValue('mock-uuid-1234');
  });

  it('renders unauthenticated prompt when access token is missing', async () => {
    vi.mocked(catalogToken).mockReturnValue(null);

    render(<CatalogWorkspace mode="staff" />);

    expect(
      screen.getByText('Sign in through your organization to view product references.')
    ).toBeInTheDocument();
  });

  it('displays organization disabled notice and allows managers to enable product catalog', async () => {
    vi.mocked(catalogApi).mockImplementation(async (path: string) => {
      if (path === '/settings') {
        return { enabled: false, role: 'MANAGER' };
      }
      return {};
    });

    render(<CatalogWorkspace mode="staff" />);

    expect(
      await screen.findByText('The product catalog is not enabled for your organization.')
    ).toBeInTheDocument();

    const enableButton = screen.getByRole('button', { name: 'Enable product catalog' });
    expect(enableButton).toBeInTheDocument();

    fireEvent.click(enableButton);

    await waitFor(() => {
      expect(catalogApi).toHaveBeenCalledWith('/settings', { enabled: true });
    });
  });

  it('renders technician view scoped to jobId and displays empty state message', async () => {
    vi.mocked(catalogApi).mockImplementation(async (path: string) => {
      if (path === '/settings') {
        return { enabled: true, role: 'TECHNICIAN' };
      }
      if (path.startsWith('/?')) {
        return { items: [], has_more: false };
      }
      return {};
    });

    render(<CatalogWorkspace mode="technician" jobId="job-tech-101" />);

    expect(
      await screen.findByText(
        'No active, review-current product references are available for this assigned job.'
      )
    ).toBeInTheDocument();

    expect(catalogApi).toHaveBeenCalledWith(expect.stringContaining('job_id=job-tech-101'));
    expect(screen.queryByText('Product catalog & source review')).not.toBeInTheDocument();
    expect(screen.getByText('Reviewed product references')).toBeInTheDocument();
    expect(screen.queryByLabelText('Version status')).not.toBeInTheDocument();
  });

  it('allows staff to view catalog items, filter by version status, and navigate pagination', async () => {
    vi.mocked(catalogApi).mockImplementation(async (path: string) => {
      if (path === '/settings') return { enabled: true, role: 'STAFF' };
      if (path === '/options') return mockOptions;
      if (path.startsWith('/?')) {
        if (path.includes('offset=0')) {
          return { items: [mockProduct], has_more: true };
        }
        return { items: [], has_more: false };
      }
      return {};
    });

    render(<CatalogWorkspace mode="staff" />);

    expect(
      await screen.findByRole('button', { name: 'CHEM-001 — Permethrin Pro' })
    ).toBeInTheDocument();

    const nextBtn = screen.getByRole('button', { name: 'Next' });
    const prevBtn = screen.getByRole('button', { name: 'Previous' });

    expect(prevBtn).toHaveAttribute('aria-disabled', 'true');
    expect(nextBtn).toHaveAttribute('aria-disabled', 'false');

    // Click next page
    fireEvent.click(nextBtn);

    await waitFor(() => {
      expect(catalogApi).toHaveBeenCalledWith(expect.stringContaining('offset=25'));
    });

    // Filter by version status
    const statusFilter = screen.getByLabelText('Version status');
    fireEvent.change(statusFilter, { target: { value: 'active' } });

    await waitFor(() => {
      expect(catalogApi).toHaveBeenCalledWith(expect.stringContaining('status=active'));
      expect(catalogApi).toHaveBeenCalledWith(expect.stringContaining('offset=0'));
    });
  });

  it('creates a new product draft with validation of permanent code and action reason', async () => {
    vi.mocked(catalogApi).mockImplementation(async (path: string, body?: unknown) => {
      if (path === '/settings') return { enabled: true, role: 'STAFF' };
      if (path === '/options') return mockOptions;
      if (path.startsWith('/?')) return { items: [], has_more: false };
      if (path === '/' && body) {
        return {
          ...mockProduct,
          code: 'CHEM-002',
          versions: [
            {
              ...mockProduct.versions[0],
              data: {
                ...mockProduct.versions[0].data,
                trade_name: 'Bifenthrin Extra',
              },
            },
          ],
        };
      }
      return {};
    });

    render(<CatalogWorkspace mode="staff" />);

    expect(
      await screen.findByText('No products match this view. Create a draft with source-backed product details.')
    ).toBeInTheDocument();

    const createBtn = screen.getByRole('button', { name: 'Create product draft' });
    expect(createBtn).toHaveAttribute('aria-disabled', 'true');

    // Fill code and trade name
    fireEvent.change(screen.getByLabelText('Permanent product code'), { target: { value: 'CHEM-002' } });
    fireEvent.change(screen.getByLabelText('Trade name'), { target: { value: 'Bifenthrin Extra' } });
    fireEvent.change(screen.getByLabelText('Manufacturer'), { target: { value: 'ChemCorp' } });

    // Still disabled without action reason
    expect(createBtn).toHaveAttribute('aria-disabled', 'true');

    fireEvent.change(screen.getByLabelText('Action reason'), {
      target: { value: 'Adding new registered termiticide' },
    });
    expect(createBtn).toHaveAttribute('aria-disabled', 'false');

    fireEvent.click(createBtn);

    await waitFor(() => {
      expect(catalogApi).toHaveBeenCalledWith(
        '/',
        expect.objectContaining({
          code: 'CHEM-002',
          reason: 'Adding new registered termiticide',
          request_key: 'mock-uuid-1234',
        })
      );
    });

    expect(await screen.findByText('Saved and confirmed by the server.')).toBeInTheDocument();
  });

  it('edits a draft, tracks dirty state to prevent premature submission, and saves draft', async () => {
    vi.mocked(catalogApi).mockImplementation(async (path: string, body?: unknown) => {
      if (path === '/settings') return { enabled: true, role: 'STAFF' };
      if (path === '/options') return mockOptions;
      if (path.startsWith('/?')) return { items: [mockProduct], has_more: false };
      if (path === '/prod-1') return mockProduct;
      if (path === '/prod-1/save') {
        return {
          ...mockProduct,
          versions: [
            {
              ...mockProduct.versions[0],
              data: {
                ...mockProduct.versions[0].data,
                jurisdiction: 'State Dept of Agriculture',
              },
            },
          ],
        };
      }
      if (path === '/prod-1/submit') {
        return {
          ...mockProduct,
          versions: [
            {
              ...mockProduct.versions[0],
              status: 'in_review',
            },
          ],
        };
      }
      return {};
    });

    render(<CatalogWorkspace mode="staff" />);

    const itemBtn = await screen.findByRole('button', { name: 'CHEM-001 — Permethrin Pro' });
    fireEvent.click(itemBtn);

    expect(await screen.findByText('Product details are saved.')).toBeInTheDocument();

    const submitBtn = screen.getByRole('button', { name: 'Submit source review' });
    const saveBtn = screen.getByRole('button', { name: 'Save draft' });

    // Reason required
    expect(submitBtn).toHaveAttribute('aria-disabled', 'true');
    expect(saveBtn).toHaveAttribute('aria-disabled', 'true');

    fireEvent.change(screen.getByLabelText('Action reason'), { target: { value: 'Updated jurisdiction' } });
    expect(submitBtn).toHaveAttribute('aria-disabled', 'false');
    expect(saveBtn).toHaveAttribute('aria-disabled', 'false');

    // Edit field to make dirty
    fireEvent.change(screen.getByLabelText('Jurisdiction'), {
      target: { value: 'State Dept of Agriculture' },
    });

    expect(
      screen.getByText('Save changed product details before adding evidence or submitting.')
    ).toBeInTheDocument();
    expect(submitBtn).toHaveAttribute('aria-disabled', 'true');

    // Save draft
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(catalogApi).toHaveBeenCalledWith(
        '/prod-1/save',
        expect.objectContaining({
          id: 'prod-1',
          revision: 1,
          version: 1,
          reason: 'Updated jurisdiction',
          data: expect.objectContaining({
            jurisdiction: 'State Dept of Agriculture',
          }),
        })
      );
    });

    // After save, reason was cleared by choose(); re-enter reason to enable submit
    expect(await screen.findByText('Product details are saved.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Action reason'), { target: { value: 'Submitting updated draft' } });
    expect(submitBtn).toHaveAttribute('aria-disabled', 'false');

    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(catalogApi).toHaveBeenCalledWith(
        '/prod-1/submit',
        expect.objectContaining({
          id: 'prod-1',
          revision: 1,
          version: 1,
        })
      );
    });
  });

  it('manages source evidence: rejects invalid file types, attaches valid PDF, and removes document', async () => {
    const productWithDoc: CatalogProduct = {
      ...mockProduct,
      versions: [
        {
          ...mockProduct.versions[0],
          documents: [
            {
              id: 'doc-1',
              name: 'Specimen Label 2026',
              document_type: 'label',
              source_kind: 'manufacturer',
              source_authority: 'EcoPest Inc.',
              source_url: 'https://example.com/label.pdf',
              source_date: '2026-01-01',
              retrieved_at: '2026-01-10T12:00:00Z',
              sha256: 'abc123hash',
            },
          ],
        },
      ],
    };

    vi.mocked(catalogApi).mockImplementation(async (path: string) => {
      if (path === '/settings') return { enabled: true, role: 'STAFF' };
      if (path === '/options') return mockOptions;
      if (path.startsWith('/?')) return { items: [mockProduct], has_more: false };
      if (path === '/prod-1') return mockProduct;
      if (path === '/prod-1/document') return productWithDoc;
      if (path === '/prod-1/remove_document') return mockProduct;
      return {};
    });

    render(<CatalogWorkspace mode="staff" />);

    const itemBtn = await screen.findByRole('button', { name: 'CHEM-001 — Permethrin Pro' });
    fireEvent.click(itemBtn);

    expect(await screen.findByText('No source evidence attached.')).toBeInTheDocument();

    // Fill document form
    fireEvent.change(screen.getByLabelText('Document name'), { target: { value: 'Specimen Label 2026' } });
    fireEvent.change(screen.getByLabelText('Source authority'), { target: { value: 'EcoPest Inc.' } });
    fireEvent.change(screen.getByLabelText('Action reason'), { target: { value: 'Adding specimen label' } });

    // Provide unknown date reason so the Add document button is enabled
    fireEvent.change(screen.getByLabelText(/Unknown document date reason/i), {
      target: { value: 'Date not printed on bottle' },
    });

    // Test non-PDF rejection
    const invalidFile = new File(['invalid text'], 'label.txt', { type: 'text/plain' });
    fireEvent.change(screen.getByLabelText(/PDF copy/i), { target: { files: [invalidFile] } });

    const addDocBtn = screen.getByRole('button', { name: 'Add document' });
    expect(addDocBtn).toHaveAttribute('aria-disabled', 'false');
    fireEvent.click(addDocBtn);

    expect(await screen.findByText('Choose a PDF up to 2 MB.')).toBeInTheDocument();

    // Provide valid source URL instead
    fireEvent.change(screen.getByLabelText(/HTTPS source URL/i), {
      target: { value: 'https://example.com/label.pdf' },
    });
    fireEvent.change(screen.getByLabelText('Document date (if known)'), {
      target: { value: '2026-01-01' },
    });

    // Clear file by changing file input to valid mock PDF
    const validPdf = new File(['%PDF-1.4 mock content'], 'label.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText(/PDF copy/i), { target: { files: [validPdf] } });

    fireEvent.click(addDocBtn);

    await waitFor(() => {
      expect(catalogApi).toHaveBeenCalledWith(
        '/prod-1/document',
        expect.objectContaining({
          id: 'prod-1',
          name: 'Specimen Label 2026',
          source_kind: 'manufacturer',
          source_authority: 'EcoPest Inc.',
          source_url: 'https://example.com/label.pdf',
        })
      );
    });

    // Check evidence link security attributes (rel="noopener noreferrer")
    const extLink = await screen.findByRole('link', { name: 'Open source reference' });
    expect(extLink).toHaveAttribute('href', 'https://example.com/label.pdf');
    expect(extLink).toHaveAttribute('target', '_blank');
    expect(extLink).toHaveAttribute('rel', 'noopener noreferrer');

    // Remove document: re-enter action reason as addDocument reset reason
    const removeBtn = screen.getByRole('button', { name: 'Remove Specimen Label 2026' });
    expect(removeBtn).toHaveAttribute('aria-disabled', 'true');

    fireEvent.change(screen.getByLabelText('Action reason'), {
      target: { value: 'Removing obsolete label' },
    });
    expect(removeBtn).toHaveAttribute('aria-disabled', 'false');

    fireEvent.click(removeBtn);

    await waitFor(() => {
      expect(catalogApi).toHaveBeenCalledWith(
        '/prod-1/remove_document',
        expect.objectContaining({
          id: 'prod-1',
          document_id: 'doc-1',
          reason: 'Removing obsolete label',
        })
      );
    });
  });

  it('manager workflow: enforces all verification checks before activating, supports rejection, withdrawal, and successor draft', async () => {
    const inReviewProduct: CatalogProduct = {
      ...mockProduct,
      versions: [
        {
          ...mockProduct.versions[0],
          status: 'in_review',
        },
      ],
    };

    const activeProduct: CatalogProduct = {
      ...mockProduct,
      versions: [
        {
          ...mockProduct.versions[0],
          status: 'active',
          verified_at: '2026-02-01T12:00:00Z',
          review_due_at: '2027-02-01T12:00:00Z',
        },
      ],
    };

    vi.mocked(catalogApi).mockImplementation(async (path: string) => {
      if (path === '/settings') return { enabled: true, role: 'MANAGER' };
      if (path === '/options') return mockOptions;
      if (path.startsWith('/?')) return { items: [inReviewProduct], has_more: false };
      if (path === '/prod-1') return inReviewProduct;
      if (path === '/prod-1/activate') return activeProduct;
      if (path === '/prod-1/reject') return mockProduct;
      if (path === '/prod-1/withdraw') {
        return {
          ...activeProduct,
          versions: [{ ...activeProduct.versions[0], status: 'withdrawn' }],
        };
      }
      if (path === '/prod-1/next_version') {
        return {
          ...mockProduct,
          versions: [
            ...mockProduct.versions,
            { ...mockProduct.versions[0], revision: 2, status: 'draft', version: 2 },
          ],
        };
      }
      return {};
    });

    render(<CatalogWorkspace mode="staff" />);

    const itemBtn = await screen.findByRole('button', { name: 'CHEM-001 — Permethrin Pro' });
    fireEvent.click(itemBtn);

    expect(await screen.findByText('Manager source verification')).toBeInTheDocument();

    const activateBtn = screen.getByRole('button', { name: 'Activate reviewed version' });
    const rejectBtn = screen.getByRole('button', { name: 'Reject source review' });

    // Buttons require action reason
    expect(activateBtn).toHaveAttribute('aria-disabled', 'true');
    expect(rejectBtn).toHaveAttribute('aria-disabled', 'true');

    fireEvent.change(screen.getByLabelText('Action reason'), {
      target: { value: 'Verified against EPA registry and SDS database' },
    });

    // Checkboxes must all be checked and reviewDue must be filled
    expect(activateBtn).toHaveAttribute('aria-disabled', 'true');
    expect(rejectBtn).toHaveAttribute('aria-disabled', 'false');

    // Check all 4 verification checkboxes
    fireEvent.click(screen.getByLabelText('Trade name and manufacturer match the sources'));
    fireEvent.click(screen.getByLabelText('Identifier or not-applicable status matches the sources'));
    fireEvent.click(screen.getByLabelText('Jurisdiction matches the evidence reviewed'));
    fireEvent.click(screen.getByLabelText('Required source documents are current and reviewed'));

    // Set next review due date
    fireEvent.change(screen.getByLabelText('Next source review due'), {
      target: { value: '2027-02-01T12:00' },
    });

    expect(activateBtn).toHaveAttribute('aria-disabled', 'false');
    fireEvent.click(activateBtn);

    await waitFor(() => {
      expect(catalogApi).toHaveBeenCalledWith(
        '/prod-1/activate',
        expect.objectContaining({
          id: 'prod-1',
          checks: {
            identity_matches: true,
            identifier_matches: true,
            jurisdiction_matches: true,
            documents_current: true,
          },
          review_due_at: expect.any(String),
        })
      );
    });

    // Now product is active; reason was reset by choose(); re-enter reason to enable withdraw
    const withdrawBtn = await screen.findByRole('button', { name: 'Withdraw active version' });
    expect(withdrawBtn).toHaveAttribute('aria-disabled', 'true');

    fireEvent.change(screen.getByLabelText('Action reason'), {
      target: { value: 'Withdrawing obsolete registration' },
    });
    expect(withdrawBtn).toHaveAttribute('aria-disabled', 'false');

    fireEvent.click(withdrawBtn);

    await waitFor(() => {
      expect(catalogApi).toHaveBeenCalledWith(
        '/prod-1/withdraw',
        expect.objectContaining({ id: 'prod-1' })
      );
    });

    // For non-draft / non-in_review version, successor draft can be created
    // Re-enter action reason since withdraw reset it
    const nextVersionBtn = await screen.findByRole('button', { name: 'Create successor draft' });
    expect(nextVersionBtn).toHaveAttribute('aria-disabled', 'true');

    fireEvent.change(screen.getByLabelText('Action reason'), {
      target: { value: 'Creating replacement version' },
    });
    expect(nextVersionBtn).toHaveAttribute('aria-disabled', 'false');

    fireEvent.click(nextVersionBtn);

    await waitFor(() => {
      expect(catalogApi).toHaveBeenCalledWith(
        '/prod-1/next_version',
        expect.objectContaining({ id: 'prod-1' })
      );
    });
  });

  it('handles network failure (status 0) and enables retry of unconfirmed action', async () => {
    let callCount = 0;
    vi.mocked(catalogApi).mockImplementation(async (path: string) => {
      if (path === '/settings') return { enabled: true, role: 'STAFF' };
      if (path === '/options') return mockOptions;
      if (path.startsWith('/?')) return { items: [mockProduct], has_more: false };
      if (path === '/prod-1') return mockProduct;
      if (path === '/prod-1/save') {
        callCount++;
        if (callCount === 1) {
          throw new CatalogError(0, 'Connection interrupted. Your action is not confirmed; retry when connected.');
        }
        return mockProduct;
      }
      return {};
    });

    render(<CatalogWorkspace mode="staff" />);

    const itemBtn = await screen.findByRole('button', { name: 'CHEM-001 — Permethrin Pro' });
    fireEvent.click(itemBtn);

    fireEvent.change(await screen.findByLabelText('Action reason'), {
      target: { value: 'Periodic save' },
    });

    const saveBtn = screen.getByRole('button', { name: 'Save draft' });
    fireEvent.click(saveBtn);

    expect(
      await screen.findByText(
        'Connection interrupted. Your action is not confirmed; retry when connected.'
      )
    ).toBeInTheDocument();

    const retryBtn = screen.getByRole('button', { name: 'Retry unconfirmed action' });
    expect(retryBtn).toBeInTheDocument();

    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(callCount).toBe(2);
    });

    expect(await screen.findByText('Saved and confirmed by the server.')).toBeInTheDocument();
  });

  it('clears selected product and items when 401 authorization error occurs', async () => {
    vi.mocked(catalogApi).mockImplementation(async (path: string) => {
      if (path === '/settings') return { enabled: true, role: 'STAFF' };
      if (path === '/options') return mockOptions;
      if (path.startsWith('/?')) {
        throw new CatalogError(401, 'Sign in through your organization to view product references.');
      }
      return {};
    });

    render(<CatalogWorkspace mode="staff" />);

    expect(
      await screen.findByText('Sign in through your organization to view product references.')
    ).toBeInTheDocument();

    expect(
      screen.getByText('No products match this view. Create a draft with source-backed product details.')
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Product version')).not.toBeInTheDocument();
  });
});
