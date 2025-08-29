import { diff_match_patch } from 'diff-match-patch';

// Initialize diff-match-patch instance
const dmp = new diff_match_patch();

export const compareDocumentBlocks = (leftHtml, rightHtml) => {
  try {
    const leftDiv = document.createElement('div');
    leftDiv.innerHTML = leftHtml;
    
    const rightDiv = document.createElement('div');
    rightDiv.innerHTML = rightHtml;

    // Extract blocks from both documents
    const leftBlocks = extractBlocks(leftDiv);
    const rightBlocks = extractBlocks(rightDiv);

    console.log('Left blocks:', leftBlocks.length);
    console.log('Right blocks:', rightBlocks.length);

    // Perform block-level comparison
    const { leftResult, rightResult, summary } = performBlockComparison(leftBlocks, rightBlocks);

    return {
      leftHtml: leftResult,
      rightHtml: rightResult,
      summary
    };
  } catch (error) {
    console.error('Error in block comparison:', error);
    return {
      leftHtml: leftHtml,
      rightHtml: rightHtml,
      summary: { additions: 0, deletions: 0, changes: 0 }
    };
  }
};

const extractBlocks = (container) => {
  const blocks = [];
  const walker = document.createTreeWalker(
    container,
    NodeFilter.SHOW_ELEMENT,
    {
      acceptNode: (node) => {
        const tagName = node.tagName.toLowerCase();
        // Accept p, table, and img elements that are not nested inside other target blocks
        if (['p', 'table', 'img'].includes(tagName)) {
          // Check if this element is nested inside another target block
          let parent = node.parentElement;
          while (parent && parent !== container) {
            const parentTag = parent.tagName.toLowerCase();
            if (['p', 'table'].includes(parentTag)) {
              return NodeFilter.FILTER_REJECT;
            }
            parent = parent.parentElement;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
        return NodeFilter.FILTER_SKIP;
      }
    }
  );

  let node;
  while ((node = walker.nextNode())) {
    const block = createBlockInfo(node);
    if (block) {
      blocks.push(block);
    }
  }

  return blocks;
};

const createBlockInfo = (element) => {
  const tagName = element.tagName.toLowerCase();
  
  // Get computed dimensions
  const computedStyle = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  
  // Calculate actual dimensions including padding and borders
  const width = Math.max(
    rect.width,
    element.offsetWidth,
    parseInt(computedStyle.width) || 0,
    300 // Minimum width
  );
  
  const height = Math.max(
    rect.height,
    element.offsetHeight,
    parseInt(computedStyle.height) || 0,
    tagName === 'img' ? 100 : 40 // Minimum height (larger for images)
  );
  
  return {
    type: tagName,
    element: element.cloneNode(true),
    originalElement: element,
    content: element.textContent || '',
    html: element.outerHTML,
    width: Math.round(width),
    height: Math.round(height),
    id: generateBlockId(element),
    index: Array.from(element.parentNode.children).indexOf(element)
  };
};

const generateBlockId = (element) => {
  const tagName = element.tagName.toLowerCase();
  const content = (element.textContent || '').trim().substring(0, 30);
  
  // For images, use src attribute
  if (tagName === 'img') {
    const src = element.getAttribute('src') || '';
    return `img-${src.substring(src.lastIndexOf('/') + 1, src.lastIndexOf('.')) || 'unknown'}`;
  }
  
  // For tables, use first cell content
  if (tagName === 'table') {
    const firstCell = element.querySelector('td, th');
    const cellContent = firstCell ? firstCell.textContent.trim().substring(0, 20) : 'table';
    return `table-${cellContent.replace(/\s+/g, '-').toLowerCase()}`;
  }
  
  // For paragraphs, use content hash
  const hash = content.split('').reduce((a, b) => {
    a = ((a << 5) - a) + b.charCodeAt(0);
    return a & a;
  }, 0);
  
  return `p-${Math.abs(hash)}-${content.replace(/\s+/g, '-').toLowerCase().substring(0, 15)}`;
};

const performBlockComparison = (leftBlocks, rightBlocks) => {
  const leftContainer = document.createElement('div');
  const rightContainer = document.createElement('div');
  
  let summary = { additions: 0, deletions: 0, changes: 0 };

  // Create a mapping of blocks by similarity
  const { matches, leftUnmatched, rightUnmatched } = matchBlocksBySimilarity(leftBlocks, rightBlocks);

  console.log('Matches found:', matches.length);
  console.log('Left unmatched:', leftUnmatched.length);
  console.log('Right unmatched:', rightUnmatched.length);

  // Process matched blocks first
  matches.forEach(({ left, right, similarity }) => {
    if (left.type === 'p' && right.type === 'p') {
      // Perform word-level comparison for paragraphs
      const { leftElement, rightElement, hasChanges } = compareAndHighlightParagraphs(left, right);
      leftContainer.appendChild(leftElement);
      rightContainer.appendChild(rightElement);
      
      if (hasChanges) {
        summary.changes++;
      }
    } else {
      // For tables and images, check if they're actually different
      const leftContent = left.type === 'img' ? left.element.getAttribute('src') : left.content;
      const rightContent = right.type === 'img' ? right.element.getAttribute('src') : right.content;
      
      if (leftContent !== rightContent) {
        // Mark as modified
        const leftModified = createModifiedBlock(left, 'left');
        const rightModified = createModifiedBlock(right, 'right');
        leftContainer.appendChild(leftModified);
        rightContainer.appendChild(rightModified);
        summary.changes++;
      } else {
        // Unchanged - add original elements
        leftContainer.appendChild(left.element);
        rightContainer.appendChild(right.element);
      }
    }
  });

  // Process unmatched blocks from left (deletions) - show in red
  leftUnmatched.forEach(block => {
    const deletedElement = createDeletedBlock(block);
    const placeholder = createPlaceholder(block, 'deleted');
    
    leftContainer.appendChild(deletedElement);
    rightContainer.appendChild(placeholder);
    summary.deletions++;
  });

  // Process unmatched blocks from right (additions) - show in green
  rightUnmatched.forEach(block => {
    const addedElement = createAddedBlock(block);
    const placeholder = createPlaceholder(block, 'added');
    
    leftContainer.appendChild(placeholder);
    rightContainer.appendChild(addedElement);
    summary.additions++;
  });

  return {
    leftResult: leftContainer.innerHTML,
    rightResult: rightContainer.innerHTML,
    summary
  };
};

const matchBlocksBySimilarity = (leftBlocks, rightBlocks) => {
  const matches = [];
  const leftUnmatched = [...leftBlocks];
  const rightUnmatched = [...rightBlocks];

  // First pass: exact matches by type and content
  leftBlocks.forEach(leftBlock => {
    const exactMatch = rightUnmatched.find(rightBlock => 
      rightBlock.type === leftBlock.type && 
      rightBlock.content.trim() === leftBlock.content.trim()
    );

    if (exactMatch) {
      matches.push({ left: leftBlock, right: exactMatch, similarity: 1.0 });
      
      const leftIndex = leftUnmatched.findIndex(b => b.id === leftBlock.id);
      const rightIndex = rightUnmatched.findIndex(b => b.id === exactMatch.id);
      
      if (leftIndex >= 0) leftUnmatched.splice(leftIndex, 1);
      if (rightIndex >= 0) rightUnmatched.splice(rightIndex, 1);
    }
  });

  // Second pass: similarity-based matching for remaining blocks
  [...leftUnmatched].forEach(leftBlock => {
    const bestMatch = findBestMatch(leftBlock, rightUnmatched);
    
    // Lower threshold for similarity to catch more matches
    if (bestMatch.score > 0.2) {
      matches.push({ left: leftBlock, right: bestMatch.block, similarity: bestMatch.score });
      
      const leftIndex = leftUnmatched.findIndex(b => b.id === leftBlock.id);
      const rightIndex = rightUnmatched.findIndex(b => b.id === bestMatch.block.id);
      
      if (leftIndex >= 0) leftUnmatched.splice(leftIndex, 1);
      if (rightIndex >= 0) rightUnmatched.splice(rightIndex, 1);
    }
  });

  return { matches, leftUnmatched, rightUnmatched };
};

const findBestMatch = (block, candidates) => {
  let bestScore = 0;
  let bestBlock = null;

  candidates.forEach(candidate => {
    // Only match same types
    if (block.type !== candidate.type) return;
    
    let score = 0;
    
    if (block.type === 'img') {
      // For images, compare src attributes
      const leftSrc = block.element.getAttribute('src') || '';
      const rightSrc = candidate.element.getAttribute('src') || '';
      score = leftSrc === rightSrc ? 1.0 : 0.0;
    } else {
      // For text content, use similarity calculation
      score = calculateTextSimilarity(block.content, candidate.content);
    }
    
    if (score > bestScore) {
      bestScore = score;
      bestBlock = candidate;
    }
  });

  return { block: bestBlock, score: bestScore };
};

const calculateTextSimilarity = (text1, text2) => {
  if (!text1 && !text2) return 1.0;
  if (!text1 || !text2) return 0.0;
  
  const diffs = dmp.diff_main(text1.trim(), text2.trim());
  const levenshtein = dmp.diff_levenshtein(diffs);
  const maxLength = Math.max(text1.length, text2.length);
  
  return maxLength > 0 ? Math.max(0, 1 - (levenshtein / maxLength)) : 0;
};

const compareAndHighlightParagraphs = (leftBlock, rightBlock) => {
  const leftText = leftBlock.content.trim();
  const rightText = rightBlock.content.trim();

  // Perform word-level diff using diff-match-patch
  const diffs = dmp.diff_main(leftText, rightText);
  dmp.diff_cleanupSemantic(diffs);

  // Create new elements with same structure but highlighted content
  const leftElement = leftBlock.element.cloneNode(false);
  const rightElement = rightBlock.element.cloneNode(false);

  // Preserve original styling
  leftElement.style.width = `${leftBlock.width}px`;
  leftElement.style.minHeight = `${leftBlock.height}px`;
  rightElement.style.width = `${rightBlock.width}px`;
  rightElement.style.minHeight = `${rightBlock.height}px`;

  let hasChanges = false;
  let leftHtml = '';
  let rightHtml = '';

  diffs.forEach(([operation, text]) => {
    const escapedText = escapeHtml(text);
    
    switch (operation) {
      case 1: // Addition (show in green on right side)
        rightHtml += `<span class="word-added">${escapedText}</span>`;
        hasChanges = true;
        break;
      case -1: // Deletion (show in red on left side)
        leftHtml += `<span class="word-deleted">${escapedText}</span>`;
        hasChanges = true;
        break;
      case 0: // No change
        leftHtml += escapedText;
        rightHtml += escapedText;
        break;
    }
  });

  leftElement.innerHTML = leftHtml;
  rightElement.innerHTML = rightHtml;

  if (hasChanges) {
    leftElement.classList.add('paragraph-modified');
    rightElement.classList.add('paragraph-modified');
  }

  return { leftElement, rightElement, hasChanges };
};

const createDeletedBlock = (block) => {
  const element = block.element.cloneNode(true);
  
  // Apply red highlighting for deleted blocks
  element.style.backgroundColor = '#fef2f2';
  element.style.border = '3px solid #ef4444';
  element.style.borderRadius = '8px';
  element.style.padding = '12px';
  element.style.margin = '8px 0';
  element.style.width = `${block.width}px`;
  element.style.height = `${block.height}px`;
  element.style.minWidth = `${block.width}px`;
  element.style.minHeight = `${block.height}px`;
  element.style.boxSizing = 'border-box';
  element.style.position = 'relative';
  element.style.opacity = '0.8';
  
  // Add deletion indicator
  const indicator = document.createElement('div');
  indicator.style.position = 'absolute';
  indicator.style.top = '-3px';
  indicator.style.left = '-3px';
  indicator.style.right = '-3px';
  indicator.style.height = '6px';
  indicator.style.backgroundColor = '#ef4444';
  indicator.style.borderRadius = '6px 6px 0 0';
  indicator.innerHTML = '<span style="position: absolute; top: -20px; left: 8px; background: #ef4444; color: white; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: bold;">DELETED</span>';
  
  element.appendChild(indicator);
  element.classList.add('block-deleted');
  
  return element;
};

const createAddedBlock = (block) => {
  const element = block.element.cloneNode(true);
  
  // Apply green highlighting for added blocks
  element.style.backgroundColor = '#f0fdf4';
  element.style.border = '3px solid #22c55e';
  element.style.borderRadius = '8px';
  element.style.padding = '12px';
  element.style.margin = '8px 0';
  element.style.width = `${block.width}px`;
  element.style.height = `${block.height}px`;
  element.style.minWidth = `${block.width}px`;
  element.style.minHeight = `${block.height}px`;
  element.style.boxSizing = 'border-box';
  element.style.position = 'relative';
  
  // Add addition indicator
  const indicator = document.createElement('div');
  indicator.style.position = 'absolute';
  indicator.style.top = '-3px';
  indicator.style.left = '-3px';
  indicator.style.right = '-3px';
  indicator.style.height = '6px';
  indicator.style.backgroundColor = '#22c55e';
  indicator.style.borderRadius = '6px 6px 0 0';
  indicator.innerHTML = '<span style="position: absolute; top: -20px; left: 8px; background: #22c55e; color: white; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: bold;">ADDED</span>';
  
  element.appendChild(indicator);
  element.classList.add('block-added');
  
  return element;
};

const createModifiedBlock = (block, side) => {
  const element = block.element.cloneNode(true);
  
  // Apply yellow highlighting for modified blocks
  element.style.backgroundColor = '#fffbeb';
  element.style.border = '3px solid #f59e0b';
  element.style.borderRadius = '8px';
  element.style.padding = '12px';
  element.style.margin = '8px 0';
  element.style.width = `${block.width}px`;
  element.style.height = `${block.height}px`;
  element.style.minWidth = `${block.width}px`;
  element.style.minHeight = `${block.height}px`;
  element.style.boxSizing = 'border-box';
  element.style.position = 'relative';
  
  // Add modification indicator
  const indicator = document.createElement('div');
  indicator.style.position = 'absolute';
  indicator.style.top = '-3px';
  indicator.style.left = '-3px';
  indicator.style.right = '-3px';
  indicator.style.height = '6px';
  indicator.style.backgroundColor = '#f59e0b';
  indicator.style.borderRadius = '6px 6px 0 0';
  indicator.innerHTML = '<span style="position: absolute; top: -20px; left: 8px; background: #f59e0b; color: white; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: bold;">MODIFIED</span>';
  
  element.appendChild(indicator);
  element.classList.add('block-modified');
  
  return element;
};

const createPlaceholder = (block, type) => {
  const placeholder = document.createElement('div');
  
  // Set exact dimensions to preserve layout
  placeholder.style.width = `${block.width}px`;
  placeholder.style.height = `${block.height}px`;
  placeholder.style.minWidth = `${block.width}px`;
  placeholder.style.minHeight = `${block.height}px`;
  placeholder.style.margin = '8px 0';
  placeholder.style.border = '3px dashed #d1d5db';
  placeholder.style.borderRadius = '8px';
  placeholder.style.display = 'flex';
  placeholder.style.alignItems = 'center';
  placeholder.style.justifyContent = 'center';
  placeholder.style.boxSizing = 'border-box';
  placeholder.style.position = 'relative';
  placeholder.style.opacity = '0.6';
  
  if (type === 'deleted') {
    placeholder.style.backgroundColor = '#fef2f2';
    placeholder.style.borderColor = '#fca5a5';
    placeholder.style.color = '#991b1b';
  } else {
    placeholder.style.backgroundColor = '#f0fdf4';
    placeholder.style.borderColor = '#86efac';
    placeholder.style.color = '#166534';
  }
  
  // Add placeholder content
  const content = document.createElement('div');
  content.style.textAlign = 'center';
  content.style.fontSize = '14px';
  content.style.fontStyle = 'italic';
  content.style.fontWeight = 'bold';
  
  const icon = type === 'deleted' ? '−' : '+';
  const text = type === 'deleted' ? 'Content Removed' : 'Content Added';
  const blockType = block.type.toUpperCase();
  
  content.innerHTML = `
    <div style="font-size: 18px; margin-bottom: 4px;">${icon}</div>
    <div>${text}</div>
    <div style="font-size: 12px; opacity: 0.7;">(${blockType})</div>
  `;
  
  placeholder.appendChild(content);
  placeholder.classList.add('block-placeholder', `placeholder-${type}`);
  
  return placeholder;
};

const escapeHtml = (text) => {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
};