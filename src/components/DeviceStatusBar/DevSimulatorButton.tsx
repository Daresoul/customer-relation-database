import React, { useState } from 'react';
import { Button, Tooltip } from 'antd';
import { ThunderboltOutlined } from '@ant-design/icons';
import { DevToolsDrawer } from '../DevTools';

/** Dev builds only: opens the device simulator, next to the lab machines chip. */
export const DevSimulatorButton: React.FC = () => {
  const [open, setOpen] = useState(false);
  if (!import.meta.env.DEV) return null;
  return (
    <>
      <Tooltip title="Dev Tools - Device Simulator">
        <Button size="small" type="dashed" icon={<ThunderboltOutlined />} onClick={() => setOpen(true)}>
          DEV
        </Button>
      </Tooltip>
      <DevToolsDrawer open={open} onClose={() => setOpen(false)} />
    </>
  );
};

export default DevSimulatorButton;
