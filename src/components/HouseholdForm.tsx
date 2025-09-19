/**
 * Standalone household creation form
 * Uses the HouseholdSearch component in creation mode
 */

import React from 'react';
import HouseholdSearch from './HouseholdSearch';

interface HouseholdFormProps {
  onSubmit: (householdData: any) => Promise<void>;
  onCancel: () => void;
}

export const HouseholdForm: React.FC<HouseholdFormProps> = ({
  onSubmit,
  onCancel
}) => {
  return (
    <div className="household-form-page">
      <HouseholdSearch
        value={undefined}
        onChange={() => {}}
        onCreateHousehold={async (householdData) => {
          await onSubmit(householdData);
        }}
        startInCreateMode={true}
        className="standalone-creation"
      />
    </div>
  );
};

export default HouseholdForm;