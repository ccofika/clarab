/**
 * Utility to extract searchable plain text from KB page blocks.
 * Handles all block types and their variants.
 */

function stripMarkdown(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')   // ![alt](url) -> alt
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')     // [text](url) -> text
    .replace(/[*_~`#]/g, '')                       // remove markdown chars
    .replace(/\n/g, ' ')                           // newlines to spaces
    .replace(/\s+/g, ' ')                          // collapse whitespace
    .trim();
}

function extractBlockText(block) {
  const content = block.defaultContent;
  if (content == null) return '';

  switch (block.type) {
    case 'paragraph':
    case 'heading_1':
    case 'heading_2':
    case 'heading_3':
    case 'quote':
      return typeof content === 'string' ? stripMarkdown(content) : '';

    case 'code':
      if (typeof content === 'object' && content !== null) return content.code || '';
      return typeof content === 'string' ? content : '';

    case 'bulleted_list':
    case 'numbered_list':
      if (typeof content === 'string') return stripMarkdown(content);
      if (Array.isArray(content)) return content.map(item => typeof item === 'string' ? stripMarkdown(item) : '').join(' ');
      if (typeof content === 'object' && content !== null && Array.isArray(content.items)) {
        return content.items.map(item => typeof item === 'string' ? stripMarkdown(item) : '').join(' ');
      }
      return '';

    case 'callout':
      if (typeof content === 'object' && content !== null) return stripMarkdown(content.text || '');
      return typeof content === 'string' ? stripMarkdown(content) : '';

    case 'toggle':
      if (typeof content === 'object' && content !== null) {
        return `${stripMarkdown(content.title || '')} ${stripMarkdown(content.body || '')}`;
      }
      return typeof content === 'string' ? stripMarkdown(content) : '';

    case 'table':
      if (typeof content === 'object' && content !== null) {
        const headers = Array.isArray(content.headers) ? content.headers.join(' ') : '';
        const rows = Array.isArray(content.rows)
          ? content.rows.map(r => Array.isArray(r) ? r.join(' ') : '').join(' ')
          : '';
        return `${headers} ${rows}`.trim();
      }
      return '';

    case 'bookmark':
      if (typeof content === 'object' && content !== null) {
        return `${content.title || ''} ${content.description || ''}`.trim();
      }
      return '';

    case 'image':
      if (typeof content === 'object' && content !== null) {
        return `${content.alt || ''} ${content.caption || ''}`.trim();
      }
      return '';

    case 'equation':
      if (typeof content === 'object' && content !== null) return content.latex || '';
      return typeof content === 'string' ? content : '';

    case 'button':
      if (typeof content === 'object' && content !== null) return content.label || content.text || '';
      return typeof content === 'string' ? content : '';

    case 'columns':
      // Columns may contain nested blocks
      if (typeof content === 'object' && content !== null && Array.isArray(content.columns)) {
        return content.columns
          .map(col => Array.isArray(col.blocks)
            ? col.blocks.map(b => extractBlockText(b)).join(' ')
            : '')
          .join(' ');
      }
      return '';

    case 'synced_block':
      if (typeof content === 'object' && content !== null && Array.isArray(content.blocks)) {
        return content.blocks.map(b => extractBlockText(b)).join(' ');
      }
      return '';

    // divider, video, embed, file, audio, pdf, breadcrumbs, table_of_contents
    default:
      // Try to extract text from string content as fallback
      if (typeof content === 'string') return stripMarkdown(content);
      if (typeof content === 'object' && content !== null && content.text) return stripMarkdown(content.text);
      return '';
  }
}

function extractAllVariantText(block) {
  let text = extractBlockText(block);

  if (block.variants) {
    // Handle both Map and plain object
    const variants = block.variants instanceof Map
      ? Object.fromEntries(block.variants)
      : (typeof block.variants === 'object' && block.variants !== null ? block.variants : {});

    for (const variantContent of Object.values(variants)) {
      const variantText = extractBlockText({ ...block, defaultContent: variantContent });
      if (variantText) text += ' ' + variantText;
    }
  }

  return text;
}

function extractPageText(page) {
  const parts = [page.title || ''];
  if (page.tags && page.tags.length > 0) parts.push(...page.tags);

  for (const block of (page.blocks || [])) {
    const blockText = extractAllVariantText(block);
    if (blockText.trim()) parts.push(blockText);
  }

  return parts.join(' ');
}

function extractExcerpts(blocks, query, maxExcerpts = 2) {
  const excerpts = [];
  const queryLower = query.toLowerCase();
  const CONTEXT_CHARS = 80;

  for (const block of (blocks || [])) {
    if (excerpts.length >= maxExcerpts) break;

    const text = extractBlockText(block);
    if (!text) continue;

    const textLower = text.toLowerCase();
    const idx = textLower.indexOf(queryLower);

    if (idx !== -1) {
      const start = Math.max(0, idx - CONTEXT_CHARS);
      const end = Math.min(text.length, idx + query.length + CONTEXT_CHARS);
      let excerpt = text.substring(start, end);

      if (start > 0) excerpt = '...' + excerpt;
      if (end < text.length) excerpt = excerpt + '...';

      // Find highlight positions within the excerpt
      const excerptLower = excerpt.toLowerCase();
      const highlights = [];
      let pos = 0;
      while ((pos = excerptLower.indexOf(queryLower, pos)) !== -1) {
        highlights.push({ start: pos, end: pos + query.length });
        pos += query.length;
      }

      excerpts.push({ text: excerpt, highlights });
    }
  }

  return excerpts;
}

module.exports = {
  extractBlockText,
  extractPageText,
  extractExcerpts,
  stripMarkdown
};
