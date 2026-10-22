import React from 'react';

export const highlightXml = (xml: string): React.ReactNode => {
  const lines = xml.split('\n');
  return lines.map((lineText, lineIdx) => {
    const parts: React.ReactNode[] = [];
    let remaining = lineText;
    let keyCounter = 0;

    while (remaining.length > 0) {
      // Match XML declaration: <?xml ... ?>
      const xmlDeclMatch = remaining.match(/^(<\?)([\w-:]+)([^?]*?)(\?>)/);
      if (xmlDeclMatch) {
        const [full, openBracket, tagName, attributes, closeBracket] = xmlDeclMatch;

        parts.push(<span key={`${lineIdx}-${keyCounter++}`} style={{ color: '#808080' }}>{openBracket}</span>);
        parts.push(<span key={`${lineIdx}-${keyCounter++}`} style={{ color: '#569CD6' }}>{tagName}</span>);

        if (attributes) {
          let attrRemaining = attributes;
          while (attrRemaining.length > 0) {
            const attrMatch = attrRemaining.match(/^(\s+)([\w-:]+)(=)("([^"]*)")?/);
            if (attrMatch) {
              const [fullAttr, space, attrName, equals, quotedValue] = attrMatch;
              parts.push(<span key={`${lineIdx}-${keyCounter++}`}>{space}</span>);
              parts.push(<span key={`${lineIdx}-${keyCounter++}`} style={{ color: '#9CDCFE' }}>{attrName}</span>);
              parts.push(<span key={`${lineIdx}-${keyCounter++}`}>{equals}</span>);
              if (quotedValue) {
                parts.push(<span key={`${lineIdx}-${keyCounter++}`} style={{ color: '#CE9178' }}>{quotedValue}</span>);
              }
              attrRemaining = attrRemaining.substring(fullAttr.length);
            } else {
              parts.push(<span key={`${lineIdx}-${keyCounter++}`}>{attrRemaining}</span>);
              break;
            }
          }
        }

        parts.push(<span key={`${lineIdx}-${keyCounter++}`} style={{ color: '#808080' }}>{closeBracket}</span>);
        remaining = remaining.substring(full.length);
        continue;
      }

      // Match regular tags: <tagname attr="value">
      const tagMatch = remaining.match(/^(<\/?)([\w-:]+)([^>]*?)(\/?>)/);
      if (tagMatch) {
        const [full, openBracket, tagName, attributes, closeBracket] = tagMatch;

        parts.push(<span key={`${lineIdx}-${keyCounter++}`} style={{ color: '#808080' }}>{openBracket}</span>);
        parts.push(<span key={`${lineIdx}-${keyCounter++}`} style={{ color: '#569CD6' }}>{tagName}</span>);

        if (attributes) {
          let attrRemaining = attributes;
          while (attrRemaining.length > 0) {
            const attrMatch = attrRemaining.match(/^(\s+)([\w-:]+)(=)("([^"]*)")?/);
            if (attrMatch) {
              const [fullAttr, space, attrName, equals, quotedValue] = attrMatch;
              parts.push(<span key={`${lineIdx}-${keyCounter++}`}>{space}</span>);
              parts.push(<span key={`${lineIdx}-${keyCounter++}`} style={{ color: '#9CDCFE' }}>{attrName}</span>);
              parts.push(<span key={`${lineIdx}-${keyCounter++}`}>{equals}</span>);
              if (quotedValue) {
                parts.push(<span key={`${lineIdx}-${keyCounter++}`} style={{ color: '#CE9178' }}>{quotedValue}</span>);
              }
              attrRemaining = attrRemaining.substring(fullAttr.length);
            } else {
              parts.push(<span key={`${lineIdx}-${keyCounter++}`}>{attrRemaining}</span>);
              break;
            }
          }
        }

        parts.push(<span key={`${lineIdx}-${keyCounter++}`} style={{ color: '#808080' }}>{closeBracket}</span>);
        remaining = remaining.substring(full.length);
      } else {
        const nextTagIndex = remaining.search(/</);
        if (nextTagIndex > 0) {
          parts.push(<span key={`${lineIdx}-${keyCounter++}`}>{remaining.substring(0, nextTagIndex)}</span>);
          remaining = remaining.substring(nextTagIndex);
        } else {
          parts.push(<span key={`${lineIdx}-${keyCounter++}`}>{remaining}</span>);
          break;
        }
      }
    }

    return <div key={lineIdx}>{parts.length > 0 ? parts : ' '}</div>;
  });
};
