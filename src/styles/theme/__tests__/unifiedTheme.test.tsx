/**
 * Spacing that the theme hands to antd components, read from the CSS antd
 * generates for them.
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Breadcrumb, ConfigProvider, Tooltip } from 'antd';
import { StyleProvider, createCache, extractStyle } from '@ant-design/cssinjs';
import { createUnifiedTheme } from '../unifiedTheme';

function cssFor(mode: 'light' | 'dark', ui: React.ReactNode): string {
  const cache = createCache();
  render(
    <StyleProvider cache={cache}>
      <ConfigProvider theme={createUnifiedTheme({ mode })}>{ui}</ConfigProvider>
    </StyleProvider>,
  );
  return extractStyle(cache, { plain: true, types: ['style'] });
}

describe.each(['light', 'dark'] as const)('%s theme', (mode) => {
  it('tooltips have 6px of padding above and below the text', () => {
    const css = cssFor(mode, <Tooltip open title="Due today"><span>x</span></Tooltip>);
    expect(css).toMatch(/\.ant-tooltip-inner\{[^}]*padding:6px 8px;/);
  });

  it('tooltips have a dark background under their white text', () => {
    const css = cssFor(mode, <Tooltip open title="Due today"><span>x</span></Tooltip>);
    const background = mode === 'dark' ? '#262626' : 'rgba\\(0, 0, 0, 0\\.75\\)';
    expect(css).toMatch(/\.ant-tooltip-inner\{[^}]*color:var\(--ant-tooltip-color, #ffffff\);/);
    expect(css).toMatch(new RegExp(`\\.ant-tooltip-inner\\{[^}]*background-color:${background};`));
  });

  it('breadcrumb separators have the same space on both sides', () => {
    const css = cssFor(mode, <Breadcrumb items={[{ title: 'Home' }, { title: 'Rex' }]} />);
    expect(css).toMatch(/\.ant-breadcrumb-separator\{margin-inline:8px;/);
  });
});
