import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AppointmentCalendar from './AppointmentCalendar';

// Mock Ant Design Calendar
vi.mock('antd', () => ({
  Calendar: ({ dateCellRender, onSelect, mode, onChange }: any) => (
    <div data-testid="calendar-mock">
      <div data-testid="calendar-mode">{mode}</div>
      <button
        data-testid="date-select-button"
        onClick={() => onSelect && onSelect(new Date('2024-01-15'))}
      >
        Select Date
      </button>
      <button
        data-testid="date-change-button"
        onClick={() => onChange && onChange(new Date('2024-01-20'))}
      >
        Change Date
      </button>
      <div data-testid="date-cell-render">
        {dateCellRender && dateCellRender(new Date('2024-01-15'))}
      </div>
    </div>
  ),
  Badge: ({ children, count }: any) => (
    <div data-testid="badge" data-count={count}>
      {children}
    </div>
  ),
  Select: ({ children, onChange, placeholder }: any) => (
    <select data-testid="view-mode-select" onChange={onChange}>
      <option value="">{placeholder}</option>
      {children}
    </select>
  ),
  Button: ({ children, onClick, type }: any) => (
    <button data-testid={`button-${type}`} onClick={onClick}>
      {children}
    </button>
  ),
}));

// Mock appointment data
const mockAppointments = [
  {
    id: 1,
    patient_id: 1,
    title: 'Checkup - Buddy',
    start_time: '2024-01-15T10:00:00',
    end_time: '2024-01-15T10:30:00',
    room_id: 1,
    status: 'scheduled' as const,
  },
  {
    id: 2,
    patient_id: 2,
    title: 'Surgery - Mittens',
    start_time: '2024-01-15T14:00:00',
    end_time: '2024-01-15T15:00:00',
    room_id: 2,
    status: 'scheduled' as const,
  },
];

// Mock hooks
vi.mock('../../hooks/useAppointments', () => ({
  useAppointments: () => ({
    data: { appointments: mockAppointments },
    isLoading: false,
    error: null,
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

describe('AppointmentCalendar', () => {
  let mockOnDateSelect: ReturnType<typeof vi.fn>;
  let mockOnAppointmentClick: ReturnType<typeof vi.fn>;
  let mockOnViewModeChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnDateSelect = vi.fn();
    mockOnAppointmentClick = vi.fn();
    mockOnViewModeChange = vi.fn();
  });

  it('renders calendar with Ant Design Calendar component', () => {
    render(
      <AppointmentCalendar
        onDateSelect={mockOnDateSelect}
        onAppointmentClick={mockOnAppointmentClick}
        onViewModeChange={mockOnViewModeChange}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByTestId('calendar-mock')).toBeInTheDocument();
  });

  it('displays appointments in date cells with badge counts', () => {
    render(
      <AppointmentCalendar
        onDateSelect={mockOnDateSelect}
        onAppointmentClick={mockOnAppointmentClick}
        onViewModeChange={mockOnViewModeChange}
      />,
      { wrapper: createWrapper() }
    );

    const dateCellContent = screen.getByTestId('date-cell-render');
    expect(dateCellContent).toBeInTheDocument();

    // Should show badge with appointment count for dates with appointments
    const badge = screen.getByTestId('badge');
    expect(badge).toHaveAttribute('data-count', '2');
  });

  it('triggers appointment creation when date is selected', async () => {
    render(
      <AppointmentCalendar
        onDateSelect={mockOnDateSelect}
        onAppointmentClick={mockOnAppointmentClick}
        onViewModeChange={mockOnViewModeChange}
      />,
      { wrapper: createWrapper() }
    );

    const selectButton = screen.getByTestId('date-select-button');
    fireEvent.click(selectButton);

    await waitFor(() => {
      expect(mockOnDateSelect).toHaveBeenCalledWith(new Date('2024-01-15'));
    });
  });

  it('switches view modes correctly (month/week/day)', async () => {
    render(
      <AppointmentCalendar
        mode="month"
        onDateSelect={mockOnDateSelect}
        onAppointmentClick={mockOnAppointmentClick}
        onViewModeChange={mockOnViewModeChange}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByTestId('calendar-mode')).toHaveTextContent('month');

    // Test view mode selector
    const viewModeSelect = screen.getByTestId('view-mode-select');
    fireEvent.change(viewModeSelect, { target: { value: 'week' } });

    await waitFor(() => {
      expect(mockOnViewModeChange).toHaveBeenCalledWith('week');
    });
  });

  it('opens appointment details when appointment is clicked', async () => {
    render(
      <AppointmentCalendar
        onDateSelect={mockOnDateSelect}
        onAppointmentClick={mockOnAppointmentClick}
        onViewModeChange={mockOnViewModeChange}
      />,
      { wrapper: createWrapper() }
    );

    // Find and click on an appointment
    const appointmentElement = screen.getByText('Checkup - Buddy');
    fireEvent.click(appointmentElement);

    await waitFor(() => {
      expect(mockOnAppointmentClick).toHaveBeenCalledWith(mockAppointments[0]);
    });
  });

  it('handles calendar navigation correctly', async () => {
    const mockOnDateChange = vi.fn();

    render(
      <AppointmentCalendar
        onDateSelect={mockOnDateSelect}
        onAppointmentClick={mockOnAppointmentClick}
        onViewModeChange={mockOnViewModeChange}
        onDateChange={mockOnDateChange}
      />,
      { wrapper: createWrapper() }
    );

    const changeButton = screen.getByTestId('date-change-button');
    fireEvent.click(changeButton);

    await waitFor(() => {
      expect(mockOnDateChange).toHaveBeenCalledWith(new Date('2024-01-20'));
    });
  });

  it('shows loading state when appointments are loading', () => {
    // Mock loading state
    vi.mocked(require('../../hooks/useAppointments').useAppointments).mockReturnValue({
      data: null,
      isLoading: true,
      error: null,
    });

    render(
      <AppointmentCalendar
        onDateSelect={mockOnDateSelect}
        onAppointmentClick={mockOnAppointmentClick}
        onViewModeChange={mockOnViewModeChange}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByText('Loading appointments...')).toBeInTheDocument();
  });

  it('displays appointments with correct time formatting', () => {
    render(
      <AppointmentCalendar
        onDateSelect={mockOnDateSelect}
        onAppointmentClick={mockOnAppointmentClick}
        onViewModeChange={mockOnViewModeChange}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByText('10:00 - Checkup - Buddy')).toBeInTheDocument();
    expect(screen.getByText('14:00 - Surgery - Mittens')).toBeInTheDocument();
  });

  it('handles empty appointment data gracefully', () => {
    vi.mocked(require('../../hooks/useAppointments').useAppointments).mockReturnValue({
      data: { appointments: [] },
      isLoading: false,
      error: null,
    });

    render(
      <AppointmentCalendar
        onDateSelect={mockOnDateSelect}
        onAppointmentClick={mockOnAppointmentClick}
        onViewModeChange={mockOnViewModeChange}
      />,
      { wrapper: createWrapper() }
    );

    // Should render calendar without errors
    expect(screen.getByTestId('calendar-mock')).toBeInTheDocument();
  });

  it('shows error message when appointments fail to load', () => {
    vi.mocked(require('../../hooks/useAppointments').useAppointments).mockReturnValue({
      data: null,
      isLoading: false,
      error: new Error('Failed to fetch appointments'),
    });

    render(
      <AppointmentCalendar
        onDateSelect={mockOnDateSelect}
        onAppointmentClick={mockOnAppointmentClick}
        onViewModeChange={mockOnViewModeChange}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByText('Error loading appointments')).toBeInTheDocument();
  });
});