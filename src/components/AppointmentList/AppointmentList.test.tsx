import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AppointmentList from './AppointmentList';

// Mock Ant Design components
vi.mock('antd', () => ({
  List: ({ dataSource, renderItem, loading }: any) => (
    <div data-testid="list-mock">
      {loading && <div data-testid="loading-spinner">Loading...</div>}
      {dataSource?.map((item: any, index: number) => (
        <div key={index} data-testid={`list-item-${index}`}>
          {renderItem(item, index)}
        </div>
      ))}
    </div>
  ),
  Card: ({ children, title, extra, onClick }: any) => (
    <div data-testid="appointment-card" onClick={onClick}>
      <div data-testid="card-title">{title}</div>
      <div data-testid="card-extra">{extra}</div>
      <div data-testid="card-content">{children}</div>
    </div>
  ),
  Badge: ({ status, text }: any) => (
    <div data-testid="status-badge" data-status={status}>
      {text}
    </div>
  ),
  DatePicker: ({ onChange, placeholder, value }: any) => (
    <input
      data-testid="date-picker"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange && onChange(new Date(e.target.value))}
    />
  ),
  Empty: ({ description }: any) => (
    <div data-testid="empty-state">
      <div data-testid="empty-description">{description}</div>
    </div>
  ),
  Spin: ({ children, spinning }: any) => (
    <div data-testid="spin-wrapper">
      {spinning && <div data-testid="spinner">Loading...</div>}
      {children}
    </div>
  ),
}));

// Mock IntersectionObserver for infinite scroll
global.IntersectionObserver = vi.fn().mockImplementation((callback) => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock appointment data
const mockAppointments = [
  {
    id: 1,
    patient_id: 1,
    patient_name: 'Buddy',
    title: 'Annual Checkup',
    description: 'Routine health examination',
    start_time: '2024-01-15T10:00:00',
    end_time: '2024-01-15T10:30:00',
    room_id: 1,
    room_name: 'Room A',
    status: 'scheduled' as const,
  },
  {
    id: 2,
    patient_id: 2,
    patient_name: 'Mittens',
    title: 'Surgery',
    description: 'Spay procedure',
    start_time: '2024-01-15T14:00:00',
    end_time: '2024-01-15T15:00:00',
    room_id: 2,
    room_name: 'Surgery Room',
    status: 'in_progress' as const,
  },
];

// Mock infinite query hook
const mockUseInfiniteAppointments = {
  data: {
    pages: [{ appointments: mockAppointments, hasMore: true }],
  },
  fetchNextPage: vi.fn(),
  hasNextPage: true,
  isFetchingNextPage: false,
  isLoading: false,
  error: null,
};

vi.mock('../../hooks/useAppointments', () => ({
  useInfiniteAppointments: () => mockUseInfiniteAppointments,
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

describe('AppointmentList', () => {
  let mockOnAppointmentClick: ReturnType<typeof vi.fn>;
  let mockOnDateFilter: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnAppointmentClick = vi.fn();
    mockOnDateFilter = vi.fn();
  });

  it('renders appointment list with appointments', () => {
    render(
      <AppointmentList
        onAppointmentClick={mockOnAppointmentClick}
        onDateFilter={mockOnDateFilter}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByTestId('list-mock')).toBeInTheDocument();
    expect(screen.getByTestId('list-item-0')).toBeInTheDocument();
    expect(screen.getByTestId('list-item-1')).toBeInTheDocument();
  });

  it('loads more items with infinite scroll', async () => {
    render(
      <AppointmentList
        onAppointmentClick={mockOnAppointmentClick}
        onDateFilter={mockOnDateFilter}
      />,
      { wrapper: createWrapper() }
    );

    // Simulate scrolling to bottom to trigger infinite scroll
    const listElement = screen.getByTestId('list-mock');
    fireEvent.scroll(listElement, { target: { scrollTop: 1000 } });

    await waitFor(() => {
      expect(mockUseInfiniteAppointments.fetchNextPage).toHaveBeenCalled();
    });
  });

  it('applies date filtering correctly', async () => {
    render(
      <AppointmentList
        onAppointmentClick={mockOnAppointmentClick}
        onDateFilter={mockOnDateFilter}
      />,
      { wrapper: createWrapper() }
    );

    const datePicker = screen.getByTestId('date-picker');
    fireEvent.change(datePicker, { target: { value: '2024-01-15' } });

    await waitFor(() => {
      expect(mockOnDateFilter).toHaveBeenCalledWith(new Date('2024-01-15'));
    });
  });

  it('displays appointment card with correct information', () => {
    render(
      <AppointmentList
        onAppointmentClick={mockOnAppointmentClick}
        onDateFilter={mockOnDateFilter}
      />,
      { wrapper: createWrapper() }
    );

    // Check first appointment
    const cards = screen.getAllByTestId('appointment-card');
    expect(cards[0]).toBeInTheDocument();

    expect(screen.getByText('Annual Checkup')).toBeInTheDocument();
    expect(screen.getByText('Buddy')).toBeInTheDocument();
    expect(screen.getByText('10:00 - 10:30')).toBeInTheDocument();
    expect(screen.getByText('Room A')).toBeInTheDocument();
    expect(screen.getByText('Routine health examination')).toBeInTheDocument();
  });

  it('shows correct status badges for appointments', () => {
    render(
      <AppointmentList
        onAppointmentClick={mockOnAppointmentClick}
        onDateFilter={mockOnDateFilter}
      />,
      { wrapper: createWrapper() }
    );

    const badges = screen.getAllByTestId('status-badge');
    expect(badges[0]).toHaveAttribute('data-status', 'default');
    expect(badges[1]).toHaveAttribute('data-status', 'processing');
  });

  it('opens appointment details when card is clicked', async () => {
    render(
      <AppointmentList
        onAppointmentClick={mockOnAppointmentClick}
        onDateFilter={mockOnDateFilter}
      />,
      { wrapper: createWrapper() }
    );

    const firstCard = screen.getAllByTestId('appointment-card')[0];
    fireEvent.click(firstCard);

    await waitFor(() => {
      expect(mockOnAppointmentClick).toHaveBeenCalledWith(mockAppointments[0]);
    });
  });

  it('displays empty state when no appointments exist', () => {
    vi.mocked(require('../../hooks/useAppointments').useInfiniteAppointments).mockReturnValue({
      ...mockUseInfiniteAppointments,
      data: { pages: [{ appointments: [], hasMore: false }] },
    });

    render(
      <AppointmentList
        onAppointmentClick={mockOnAppointmentClick}
        onDateFilter={mockOnDateFilter}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.getByText('No appointments found')).toBeInTheDocument();
  });

  it('shows loading state when appointments are loading', () => {
    vi.mocked(require('../../hooks/useAppointments').useInfiniteAppointments).mockReturnValue({
      ...mockUseInfiniteAppointments,
      isLoading: true,
      data: null,
    });

    render(
      <AppointmentList
        onAppointmentClick={mockOnAppointmentClick}
        onDateFilter={mockOnDateFilter}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
  });

  it('shows loading indicator when fetching more pages', () => {
    vi.mocked(require('../../hooks/useAppointments').useInfiniteAppointments).mockReturnValue({
      ...mockUseInfiniteAppointments,
      isFetchingNextPage: true,
    });

    render(
      <AppointmentList
        onAppointmentClick={mockOnAppointmentClick}
        onDateFilter={mockOnDateFilter}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByText('Loading more appointments...')).toBeInTheDocument();
  });

  it('handles error state gracefully', () => {
    vi.mocked(require('../../hooks/useAppointments').useInfiniteAppointments).mockReturnValue({
      ...mockUseInfiniteAppointments,
      error: new Error('Failed to load appointments'),
      data: null,
    });

    render(
      <AppointmentList
        onAppointmentClick={mockOnAppointmentClick}
        onDateFilter={mockOnDateFilter}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByText('Error loading appointments')).toBeInTheDocument();
  });

  it('formats appointment times correctly', () => {
    render(
      <AppointmentList
        onAppointmentClick={mockOnAppointmentClick}
        onDateFilter={mockOnDateFilter}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByText('10:00 - 10:30')).toBeInTheDocument();
    expect(screen.getByText('14:00 - 15:00')).toBeInTheDocument();
  });

  it('displays appointment dates correctly', () => {
    render(
      <AppointmentList
        onAppointmentClick={mockOnAppointmentClick}
        onDateFilter={mockOnDateFilter}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByText('Jan 15, 2024')).toBeInTheDocument();
  });

  it('handles appointments without room assignment', () => {
    const appointmentWithoutRoom = {
      ...mockAppointments[0],
      room_id: null,
      room_name: null,
    };

    vi.mocked(require('../../hooks/useAppointments').useInfiniteAppointments).mockReturnValue({
      ...mockUseInfiniteAppointments,
      data: { pages: [{ appointments: [appointmentWithoutRoom], hasMore: false }] },
    });

    render(
      <AppointmentList
        onAppointmentClick={mockOnAppointmentClick}
        onDateFilter={mockOnDateFilter}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByText('No room assigned')).toBeInTheDocument();
  });

  it('supports keyboard navigation for accessibility', async () => {
    render(
      <AppointmentList
        onAppointmentClick={mockOnAppointmentClick}
        onDateFilter={mockOnDateFilter}
      />,
      { wrapper: createWrapper() }
    );

    const firstCard = screen.getAllByTestId('appointment-card')[0];
    fireEvent.keyDown(firstCard, { key: 'Enter', code: 'Enter' });

    await waitFor(() => {
      expect(mockOnAppointmentClick).toHaveBeenCalledWith(mockAppointments[0]);
    });
  });
});