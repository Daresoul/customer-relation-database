import React from 'react';
import { Modal } from 'antd';
import { HomeOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { CreateHouseholdInline, type CreatedHousehold } from './CreateHouseholdInline';

export interface CreateHouseholdModalProps {
  open: boolean;
  /** Called with the new household after creation succeeds. Modal closes
   *  automatically after this returns. */
  onCreated: (household: CreatedHousehold) => void | Promise<void>;
  onCancel: () => void;
}

/**
 * Modal wrapper around <CreateHouseholdInline />.
 *
 * Use this when the trigger lives inside another AntD <Form> — nesting
 * the inline component directly would cause submit-bubbling issues and
 * mixed form contexts. Modal is also the right call when the parent
 * doesn't have room for the form (e.g. inside a Drawer / smaller card).
 *
 * Footer is intentionally suppressed — the inline component already
 * renders its own submit + cancel buttons.
 */
export const CreateHouseholdModal: React.FC<CreateHouseholdModalProps> = ({
  open,
  onCreated,
  onCancel,
}) => {
  const { t } = useTranslation('patients');

  const handleCreated = async (household: CreatedHousehold) => {
    await onCreated(household);
  };

  return (
    <Modal
      open={open}
      title={
        <span>
          <HomeOutlined style={{ marginRight: 8 }} />
          {t('detail.householdInfo.createNewHousehold', 'Create New Household')}
        </span>
      }
      onCancel={onCancel}
      footer={null}
      destroyOnClose
      width={520}
    >
      {open && (
        <CreateHouseholdInline
          onCreated={handleCreated}
          onCancel={onCancel}
        />
      )}
    </Modal>
  );
};

export default CreateHouseholdModal;
