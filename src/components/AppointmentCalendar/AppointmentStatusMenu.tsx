import React from 'react';
import { Dropdown } from 'antd';
import { useTranslation } from 'react-i18next';
import type { Appointment, AppointmentStatus } from '../../types/appointments';
import { nextStatuses, statusActionKey } from '../../utils/appointmentStatus';

interface AppointmentStatusMenuProps {
  appointment: Appointment;
  onStatusChange?: (appointment: Appointment, status: AppointmentStatus) => void;
  children: React.ReactElement;
}

/** Right-click on a card: the statuses the visit can move to, one click each. */
export const AppointmentStatusMenu: React.FC<AppointmentStatusMenuProps> = ({
  appointment,
  onStatusChange,
  children,
}) => {
  const { t } = useTranslation('appointments');
  if (!onStatusChange) return children;

  const items = nextStatuses(appointment.status).map((status) => ({
    key: status,
    label: t(statusActionKey(status)),
  }));

  return (
    <Dropdown
      trigger={['contextMenu']}
      menu={{
        items,
        onClick: ({ key, domEvent }) => {
          domEvent.stopPropagation();
          onStatusChange(appointment, key as AppointmentStatus);
        },
      }}
    >
      {children}
    </Dropdown>
  );
};

export default AppointmentStatusMenu;
