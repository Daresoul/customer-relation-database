import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AppointmentModal from './AppointmentModal';

// Mock Ant Design components
vi.mock('antd', () => ({
  Modal: ({ open, onCancel, onOk, title, children }: any) => (
    <div data-testid="modal" style={{ display: open ? 'block' : 'none' }}>
      <div data-testid="modal-title">{title}</div>
      <div data-testid="modal-content">{children}</div>
      <button data-testid="modal-cancel" onClick={onCancel}>
        Cancel
      </button>
      <button data-testid="modal-ok" onClick={onOk}>
        Save
      </button>
    </div>
  ),
  Form: ({ children, form, onFinish, initialValues }: any) => (
    <form data-testid="appointment-form" onSubmit={onFinish}>
      {children}
    </form>
  ),
  'Form.Item': ({ children, label, name, rules }: any) => (
    <div data-testid={`form-item-${name}`}>
      <label data-testid={`label-${name}`}>{label}</label>
      {children}
      {rules?.some((rule: any) => rule.required) && (
        <span data-testid={`required-${name}`} aria-label="required">
          *
        </span>
      )}
    </div>
  ),
  Input: ({ placeholder, value, onChange }: any) => (
    <input
      data-testid="input-field"
      placeholder={placeholder}
      value={value}
      onChange={onChange}
    />
  ),
  'Input.TextArea': ({ placeholder, value, onChange, rows }: any) => (
    <textarea
      data-testid="textarea-field"
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      rows={rows}
    />
  ),
  Select: ({ children, placeholder, value, onChange, loading, onSearch }: any) => (
    <select
      data-testid="select-field"
      value={value}
      onChange={(e) => onChange && onChange(e.target.value)}
    >
      <option value="">{placeholder}</option>
      {children}
    </select>
  ),
  'Select.Option': ({ children, value }: any) => (
    <option value={value}>{children}</option>
  ),
  TimePicker: ({ value, onChange, format, minuteStep }: any) => (
    <input
      data-testid="time-picker"
      type="time"
      value={value}
      onChange={(e) => onChange && onChange(e.target.value)}
      data-minute-step={minuteStep}
      data-format={format}
    />
  ),
  DatePicker: ({ value, onChange, placeholder }: any) => (
    <input
      data-testid="date-picker"
      type="date"
      value={value}
      onChange={(e) => onChange && onChange(e.target.value)}
      placeholder={placeholder}
    />
  ),
  Alert: ({ message, type, showIcon }: any) => (
    <div data-testid="alert" data-type={type}>
      {showIcon && <span data-testid="alert-icon">!</span>}
      {message}
    </div>
  ),
  message: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

// Mock patients data
const mockPatients = [
  { id: 1, name: 'Buddy', owner_name: 'John Doe' },
  { id: 2, name: 'Mittens', owner_name: 'Jane Smith' },
];

// Mock rooms data
const mockRooms = [
  { id: 1, name: 'Room A', description: 'General examination room' },
  { id: 2, name: 'Surgery Room', description: 'Surgical procedures' },
];

// Mock appointment data
const mockAppointment = {
  id: 1,
  patient_id: 1,
  title: 'Annual Checkup',
  description: 'Routine health examination',
  start_time: '2024-01-15T10:00:00',
  end_time: '2024-01-15T10:30:00',
  room_id: 1,
  status: 'scheduled' as const,
};

// Mock hooks
vi.mock('../../hooks/usePatients', () => ({
  usePatients: () => ({
    data: { patients: mockPatients },
    isLoading: false,
  }),
}));

vi.mock('../../hooks/useRooms', () => ({
  useRooms: () => ({
    data: { rooms: mockRooms },
    isLoading: false,
  }),
}));

vi.mock('../../hooks/useAppointments', () => ({
  useCreateAppointment: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
  useUpdateAppointment: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
  useCheckConflicts: () => ({
    mutate: vi.fn(),
    data: null,
    isPending: false,
  }),
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};

describe('AppointmentModal', () => {
  let mockOnClose: ReturnType<typeof vi.fn>;
  let mockOnSave: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnClose = vi.fn();
    mockOnSave = vi.fn();
  });

  it('opens and closes modal correctly', () => {
    const { rerender } = render(
      <AppointmentModal
        open={false}
        onClose={mockOnClose}
        onSave={mockOnSave}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByTestId('modal')).toHaveStyle({ display: 'none' });

    rerender(
      <AppointmentModal
        open={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
      />
    );

    expect(screen.getByTestId('modal')).toHaveStyle({ display: 'block' });
  });

  it('closes modal when cancel button is clicked', async () => {
    render(
      <AppointmentModal
        open={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
      />,
      { wrapper: createWrapper() }
    );

    const cancelButton = screen.getByTestId('modal-cancel');
    fireEvent.click(cancelButton);

    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it('validates required fields correctly', async () => {
    render(
      <AppointmentModal
        open={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
      />,
      { wrapper: createWrapper() }
    );

    // Check that required fields are marked
    expect(screen.getByTestId('required-patient_id')).toBeInTheDocument();
    expect(screen.getByTestId('required-title')).toBeInTheDocument();
    expect(screen.getByTestId('required-start_time')).toBeInTheDocument();
    expect(screen.getByTestId('required-end_time')).toBeInTheDocument();
    expect(screen.getByTestId('required-date')).toBeInTheDocument();
  });

  it('enforces 15-minute time picker intervals', () => {
    render(
      <AppointmentModal
        open={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
      />,
      { wrapper: createWrapper() }
    );

    const timePickers = screen.getAllByTestId('time-picker');
    expect(timePickers[0]).toHaveAttribute('data-minute-step', '15');
    expect(timePickers[1]).toHaveAttribute('data-minute-step', '15');
  });

  it('displays room selection dropdown with available rooms', () => {
    render(
      <AppointmentModal
        open={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByTestId('form-item-room_id')).toBeInTheDocument();
    expect(screen.getByText('Room A')).toBeInTheDocument();
    expect(screen.getByText('Surgery Room')).toBeInTheDocument();
  });

  it('displays patient selection dropdown with search', () => {
    render(
      <AppointmentModal
        open={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByTestId('form-item-patient_id')).toBeInTheDocument();
    expect(screen.getByText('Buddy (John Doe)')).toBeInTheDocument();
    expect(screen.getByText('Mittens (Jane Smith)')).toBeInTheDocument();
  });

  it('shows conflict warning when scheduling conflicts exist', async () => {
    const mockCheckConflicts = vi.fn().mockResolvedValue([
      {
        id: 2,
        title: 'Existing Appointment',
        start_time: '2024-01-15T10:15:00',
        end_time: '2024-01-15T10:45:00',
      },
    ]);

    vi.mocked(require('../../hooks/useAppointments').useCheckConflicts).mockReturnValue({
      mutate: mockCheckConflicts,
      data: [
        {
          id: 2,
          title: 'Existing Appointment',
          start_time: '2024-01-15T10:15:00',
          end_time: '2024-01-15T10:45:00',
        },
      ],
      isPending: false,
    });

    render(
      <AppointmentModal
        open={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByTestId('alert')).toBeInTheDocument();
    expect(screen.getByText(/scheduling conflict/i)).toBeInTheDocument();
  });

  it('saves appointment when form is submitted with valid data', async () => {
    const mockCreate = vi.fn();
    vi.mocked(require('../../hooks/useAppointments').useCreateAppointment).mockReturnValue({
      mutate: mockCreate,
      isPending: false,
    });

    render(
      <AppointmentModal
        open={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
      />,
      { wrapper: createWrapper() }
    );

    // Fill form with valid data
    fireEvent.change(screen.getByTestId('input-field'), {
      target: { value: 'Test Appointment' },
    });

    const saveButton = screen.getByTestId('modal-ok');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalled();
    });
  });

  it('populates form with existing appointment data in edit mode', () => {
    render(
      <AppointmentModal
        open={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
        appointment={mockAppointment}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByTestId('modal-title')).toHaveTextContent('Edit Appointment');
    // Form should be populated with existing data
    expect(screen.getByDisplayValue('Annual Checkup')).toBeInTheDocument();
  });

  it('shows create mode when no appointment is provided', () => {
    render(
      <AppointmentModal
        open={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByTestId('modal-title')).toHaveTextContent('Create Appointment');
  });

  it('validates end time is after start time', async () => {
    render(
      <AppointmentModal
        open={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
      />,
      { wrapper: createWrapper() }
    );

    const timePickers = screen.getAllByTestId('time-picker');

    // Set start time after end time
    fireEvent.change(timePickers[0], { target: { value: '14:00' } });
    fireEvent.change(timePickers[1], { target: { value: '13:00' } });

    const saveButton = screen.getByTestId('modal-ok');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText(/end time must be after start time/i)).toBeInTheDocument();
    });
  });

  it('calculates duration automatically when times are set', async () => {
    render(
      <AppointmentModal
        open={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
      />,
      { wrapper: createWrapper() }
    );

    const timePickers = screen.getAllByTestId('time-picker');

    fireEvent.change(timePickers[0], { target: { value: '10:00' } });
    fireEvent.change(timePickers[1], { target: { value: '10:30' } });

    await waitFor(() => {
      expect(screen.getByText('Duration: 30 minutes')).toBeInTheDocument();
    });
  });

  it('shows loading state while saving', () => {
    vi.mocked(require('../../hooks/useAppointments').useCreateAppointment).mockReturnValue({
      mutate: vi.fn(),
      isPending: true,
    });

    render(
      <AppointmentModal
        open={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByText('Saving...')).toBeInTheDocument();
  });

  it('disables save button during conflict check', () => {
    vi.mocked(require('../../hooks/useAppointments').useCheckConflicts).mockReturnValue({
      mutate: vi.fn(),
      data: null,
      isPending: true,
    });

    render(
      <AppointmentModal
        open={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
      />,
      { wrapper: createWrapper() }
    );

    const saveButton = screen.getByTestId('modal-ok');
    expect(saveButton).toBeDisabled();
  });

  it('handles form validation errors gracefully', async () => {
    render(
      <AppointmentModal
        open={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
      />,
      { wrapper: createWrapper() }
    );

    // Try to save without filling required fields
    const saveButton = screen.getByTestId('modal-ok');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText(/please fill in all required fields/i)).toBeInTheDocument();
    });
  });

  it('allows setting default date and time from props', () => {
    const defaultDateTime = new Date('2024-01-15T14:00:00');

    render(
      <AppointmentModal
        open={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
        defaultDateTime={defaultDateTime}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByDisplayValue('2024-01-15')).toBeInTheDocument();
    expect(screen.getByDisplayValue('14:00')).toBeInTheDocument();
  });
});