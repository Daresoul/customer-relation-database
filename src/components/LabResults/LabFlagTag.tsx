import React from 'react';
import { Tag } from 'antd';
import { useTranslation } from 'react-i18next';
import type { LabFlag } from '../../types/labResults';

/** A red H or blue L next to a value outside its range; nothing otherwise. */
export const LabFlagTag: React.FC<{ flag: LabFlag }> = ({ flag }) => {
  const { t } = useTranslation('devices');
  if (flag !== 'H' && flag !== 'L') return null;
  return (
    <Tag
      color={flag === 'H' ? 'red' : 'blue'}
      aria-label={t(`devices:labs.flags.${flag}`)}
      style={{ marginInlineStart: 4, marginInlineEnd: 0 }}
    >
      {flag}
    </Tag>
  );
};

export default LabFlagTag;
