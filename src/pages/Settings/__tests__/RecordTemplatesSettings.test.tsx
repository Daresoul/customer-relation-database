import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from 'antd';
import RecordTemplatesSettings from '../components/RecordTemplatesSettings';
import type { RecordTemplate } from '@/types/medical';

const mocks = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn() }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const at = '2026-10-20T10:00:00Z';
const templates: RecordTemplate[] = [
  {
    id: 1,
    recordType: 'procedure',
    title: 'Вакцинација',
    description: 'Вакцина DHPPi, општ преглед.',
    prescriptionNotes: 'Без капење 3 дена.',
    lineItems: [
      { lineItemTemplateId: 11, quantity: 1, name: 'Nobivac DHPPi', unitPrice: 900, currencyId: 1, taxRateId: 2, vatName: 'ДДВ 5%', vatPercent: 5, isActive: true },
    ],
    diagnosisIds: [4],
    createdAt: at,
    updatedAt: at,
  },
];

vi.mock('@/hooks/useRecordTemplates', () => ({
  useRecordTemplates: () => ({ data: templates, isLoading: false }),
  useCreateRecordTemplate: () => ({ mutateAsync: mocks.create, isPending: false }),
  useUpdateRecordTemplate: () => ({ mutateAsync: mocks.update, isPending: false }),
  useDeleteRecordTemplate: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/useLineItemTemplates', () => ({
  useLineItemTemplates: () => ({
    data: [
      { id: 11, name: 'Nobivac DHPPi', defaultPrice: 900, currencyId: 1, displayOrder: 0, isActive: true, createdAt: at, updatedAt: at },
      { id: 12, name: 'Преглед', defaultPrice: 500, currencyId: 1, displayOrder: 1, isActive: true, createdAt: at, updatedAt: at },
    ],
    isLoading: false,
  }),
}));
vi.mock('@/hooks/useDiagnoses', () => ({
  useDiagnoses: () => ({
    data: [
      { id: 3, name: 'Отитис', isActive: true },
      { id: 4, name: 'Здрав', isActive: true },
    ],
    isLoading: false,
  }),
}));

afterEach(() => {
  cleanup();
  mocks.create.mockReset();
  mocks.update.mockReset();
});

async function choose(user: ReturnType<typeof userEvent.setup>, select: HTMLElement, text: string) {
  await user.click(select.querySelector('input') as HTMLElement);
  const options = await screen.findAllByText(text, { selector: '.ant-select-item-option-content' });
  await user.click(options[options.length - 1]);
}

describe('Settings › Record templates', () => {
  it('shows what each template fills in', () => {
    render(<App><RecordTemplatesSettings /></App>);
    const row = screen.getByText('Вакцинација').closest('tr') as HTMLElement;
    expect(row.textContent).toContain('Nobivac DHPPi');
  });

  it('saves prescription, price-list lines with quantity, and diagnoses on a new template', async () => {
    mocks.create.mockResolvedValue(templates[0]);
    const user = userEvent.setup();
    render(<App><RecordTemplatesSettings /></App>);

    await user.click(screen.getByRole('button', { name: /settings:templates.createTemplate/ }));
    const dialog = await screen.findByRole('dialog');
    await choose(user, within(dialog).getByTestId('template-record-type'), 'medical:recordTypes.procedure');
    await user.type(within(dialog).getByLabelText('medical:fields.title'), 'Вакцинација');
    await user.type(within(dialog).getByLabelText('medical:fields.description'), 'Вакцина и преглед.');
    await user.type(within(dialog).getByLabelText('medical:fields.prescriptionNotes'), 'Без капење.');
    await user.click(within(dialog).getByRole('button', { name: /settings:templates.addLine/ }));
    await choose(user, within(dialog).getByTestId('template-line-0'), 'Преглед');
    const quantity = within(within(dialog).getByTestId('template-line-0')).getByLabelText('settings:templates.quantity');
    await user.clear(quantity);
    await user.type(quantity, '2');
    await choose(user, within(dialog).getByTestId('template-diagnoses'), 'Здрав');
    await user.click(within(dialog).getByRole('button', { name: 'common:buttons.create' }));

    await waitFor(() => expect(mocks.create).toHaveBeenCalled());
    expect(mocks.create.mock.calls[0][0]).toEqual({
      recordType: 'procedure',
      title: 'Вакцинација',
      description: 'Вакцина и преглед.',
      prescriptionNotes: 'Без капење.',
      lineItems: [{ lineItemTemplateId: 12, quantity: 2 }],
      diagnosisIds: [4],
    });
  });

  it("opens a template with its contents and can change its record type", async () => {
    mocks.update.mockResolvedValue(templates[0]);
    const user = userEvent.setup();
    render(<App><RecordTemplatesSettings /></App>);

    const row = screen.getByText('Вакцинација').closest('tr') as HTMLElement;
    await user.click(within(row).getByRole('button', { name: /common:buttons.edit/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('medical:fields.prescriptionNotes')).toHaveValue('Без капење 3 дена.');
    await choose(user, within(dialog).getByTestId('template-record-type'), 'medical:recordTypes.note');
    await user.click(within(dialog).getByRole('button', { name: 'common:buttons.update' }));

    await waitFor(() => expect(mocks.update).toHaveBeenCalled());
    expect(mocks.update.mock.calls[0][0]).toEqual({
      templateId: 1,
      input: {
        recordType: 'note',
        title: 'Вакцинација',
        description: 'Вакцина DHPPi, општ преглед.',
        prescriptionNotes: 'Без капење 3 дена.',
        lineItems: [{ lineItemTemplateId: 11, quantity: 1 }],
        diagnosisIds: [4],
      },
    });
  });
});
