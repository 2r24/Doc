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

    // Perform accurate mutual comparison
    const { leftResult, rightResult, summary } = performMutualBlockComparison(leftBlocks, rightBlocks);

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
  let index = 0;
  while ((node = walker.nextNode())) {
    const block = createBlockInfo(node, index++);
    if (block) {
      blocks.push(block);
    }
  }

  return blocks;
};

const createBlockInfo = (element, index) => {
  const tagName = element.tagName.toLowerCase();
  
  // Get element dimensions
  const rect = element.getBoundingClientRect();
  const computedStyle = window.getComputedStyle(element);
  
  // Calculate actual dimensions
  const width = Math.max(
    rect.width || 0,
    element.offsetWidth || 0,
    parseInt(computedStyle.width) || 0,
    300 // Minimum width
  );
  
  const height = Math.max(
    rect.height || 0,
    element.offsetHeight || 0,
    parseInt(computedStyle.height) || 0,
    tagName === 'img' ? 100 : 40 // Minimum height
  );
  
  // Get content for comparison
  let content = '';
  let compareKey = '';
  
  if (tagName === 'img') {
    content = element.getAttribute('src') || '';
    compareKey = content;
  } else if (tagName === 'table') {
    content = extractTableContent(element);
    compareKey = content;
  } else {
    content = (element.textContent || '').trim();
    compareKey = normalizeText(content);
  }
  
  return {
    type: tagName,
    element: element.cloneNode(true),
    originalElement: element,
    content: content,
    compareKey: compareKey,
    html: element.outerHTML,
    width: Math.round(width),
    height: Math.round(height),
    index: index,
    id: `${tagName}-${index}-${generateHash(compareKey)}`
  };
};

const extractTableContent = (table) => {
  const rows = Array.from(table.rows || []);
  return rows.map(row => {
    const cells = Array.from(row.cells || []);
    return cells.map(cell => (cell.textContent || '').trim()).join('\t');
  }).join('\n');
};

const normalizeText = (text) => {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
};

const generateHash = (str) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
};

const performMutualBlockComparison = (leftBlocks, rightBlocks) => {
  const leftContainer = document.createElement('div');
  const rightContainer = document.createElement('div');
  
  let summary = { additions: 0, deletions: 0, changes: 0 };

  // Create exact matching based on content
  const { exactMatches, leftUnmatched, rightUnmatched, modifiedPairs } = findExactMatches(leftBlocks, rightBlocks);

  console.log('Exact matches:', exactMatches.length);
  console.log('Modified pairs:', modifiedPairs.length);
  console.log('Left unmatched (deletions):', leftUnmatched.length);
  console.log('Right unmatched (additions):', rightUnmatched.length);

  // Track all processed blocks to maintain order
  const allBlocks = [];

  // Process exact matches (no highlighting needed)
  exactMatches.forEach(({ left, right }) => {
    allBlocks.push({
      type: 'match',
      leftBlock: left,
      rightBlock: right,
      leftElement: left.element.cloneNode(true),
      rightElement: right.element.cloneNode(true)
    });
  });

  // Process modified pairs (word-level diff for paragraphs)
  modifiedPairs.forEach(({ left, right }) => {
    if (left.type === 'p' && right.type === 'p') {
      const { leftElement, rightElement } = performWordLevelDiff(left, right);
      allBlocks.push({
        type: 'modified',
        leftBlock: left,
        rightBlock: right,
        leftElement: leftElement,
        rightElement: rightElement
      });
      summary.changes++;
    } else {
      // For tables and images, show as modified
      const leftModified = createModifiedBlock(left, 'left');
      const rightModified = createModifiedBlock(right, 'right');
      allBlocks.push({
        type: 'modified',
        leftBlock: left,
        rightBlock: right,
        leftElement: leftModified,
        rightElement: rightModified
      });
      summary.changes++;
    }
  });

  // Process deletions (exists in left but not in right)
  leftUnmatched.forEach(block => {
    const deletedElement = createDeletedBlock(block);
    const placeholder = createPlaceholder(block, 'deleted');
    
    allBlocks.push({
      type: 'deleted',
      leftBlock: block,
      rightBlock: null,
      leftElement: deletedElement,
      rightElement: placeholder
    });
    summary.deletions++;
  });

  // Process additions (exists in right but not in left)
  rightUnmatched.forEach(block => {
    const addedElement = createAddedBlock(block);
    const placeholder = createPlaceholder(block, 'added');
    
    allBlocks.push({
      type: 'added',
      leftBlock: null,
      rightBlock: block,
      leftElement: placeholder,
      rightElement: addedElement
    });
    summary.additions++;
  });

  // Sort blocks by original document order
  allBlocks.sort((a, b) => {
    const aIndex = a.leftBlock ? a.leftBlock.index : (a.rightBlock ? a.rightBlock.index : 0);
    const bIndex = b.leftBlock ? b.leftBlock.index : (b.rightBlock ? b.rightBlock.index : 0);
    return aIndex - bIndex;
  });

  // Build final HTML
  allBlocks.forEach(block => {
    leftContainer.appendChild(block.leftElement);
    rightContainer.appendChild(block.rightElement);
  });

  return {
    leftResult: leftContainer.innerHTML,
    rightResult: rightContainer.innerHTML,
    summary
  };
};

const findExactMatches = (leftBlocks, rightBlocks) => {
  const exactMatches = [];
  const modifiedPairs = [];
  const leftUnmatched = [...leftBlocks];
  const rightUnmatched = [...rightBlocks];

  // First pass: Find exact matches
  leftBlocks.forEach(leftBlock => {
    const exactMatchIndex = rightUnmatched.findIndex(rightBlock => 
      rightBlock.type === leftBlock.type && 
      rightBlock.compareKey === leftBlock.compareKey
    );

    if (exactMatchIndex >= 0) {
      const rightBlock = rightUnmatched[exactMatchIndex];
      exactMatches.push({ left: leftBlock, right: rightBlock });
      
      // Remove from unmatched lists
      const leftIndex = leftUnmatched.findIndex(b => b.id === leftBlock.id);
      if (leftIndex >= 0) leftUnmatched.splice(leftIndex, 1);
      rightUnmatched.splice(exactMatchIndex, 1);
    }
  });

  // Second pass: Find similar blocks for modification detection
  [...leftUnmatched].forEach(leftBlock => {
    const similarIndex = rightUnmatched.findIndex(rightBlock => 
      rightBlock.type === leftBlock.type && 
      calculateSimilarity(leftBlock.compareKey, rightBlock.compareKey) > 0.6
    );

    if (similarIndex >= 0) {
      const rightBlock = rightUnmatched[similarIndex];
      modifiedPairs.push({ left: leftBlock, right: rightBlock });
      
      // Remove from unmatched lists
      const leftIndex = leftUnmatched.findIndex(b => b.id === leftBlock.id);
      if (leftIndex >= 0) leftUnmatched.splice(leftIndex, 1);
      rightUnmatched.splice(similarIndex, 1);
    }
  });

  return { exactMatches, leftUnmatched, rightUnmatched, modifiedPairs };
};

const calculateSimilarity = (text1, text2) => {
  if (!text1 && !text2) return 1.0;
  if (!text1 || !text2) return 0.0;
  
  const diffs = dmp.diff_main(text1, text2);
  const levenshtein = dmp.diff_levenshtein(diffs);
  const maxLength = Math.max(text1.length, text2.length);
  
  return maxLength > 0 ? Math.max(0, 1 - (levenshtein / maxLength)) : 0;
};

const performWordLevelDiff = (leftBlock, rightBlock) => {
  const leftText = leftBlock.content;
  const rightText = rightBlock.content;

  // Perform word-level diff
  const diffs = dmp.diff_main(leftText, rightText);
  dmp.diff_cleanupSemantic(diffs);

  // Create elements with highlighting
  const leftElement = leftBlock.element.cloneNode(false);
  const rightElement = rightBlock.element.cloneNode(false);

  // Apply exact dimensions
  applyBlockDimensions(leftElement, leftBlock);
  applyBlockDimensions(rightElement, rightBlock);

  // Build highlighted content
  let leftHtml = '';
  let rightHtml = '';

  diffs.forEach(([operation, text]) => {
    const escapedText = escapeHtml(text);
    
    switch (operation) {
      case 1: // Addition - show in green on right, invisible on left
        rightHtml += `<span class="word-added">${escapedText}</span>`;
        break;
      case -1: // Deletion - show in red on left, invisible on right
        leftHtml += `<span class="word-deleted">${escapedText}</span>`;
        break;
      case 0: // No change - show normally on both sides
        leftHtml += escapedText;
        rightHtml += escapedText;
        break;
    }
  });

  leftElement.innerHTML = leftHtml;
  rightElement.innerHTML = rightHtml;

  // Add modification styling
  leftElement.classList.add('block-modified-paragraph');
  rightElement.classList.add('block-modified-paragraph');

  return { leftElement, rightElement };
};

const createDeletedBlock = (block) => {
  const element = block.element.cloneNode(true);
  
  // Apply red highlighting for deleted blocks
  element.classList.add('block-deleted');
  applyBlockDimensions(element, block);
  
  // Add deletion styling
  element.style.backgroundColor = '#fef2f2';
  element.style.border = '3px solid #ef4444';
  element.style.borderRadius = '8px';
  element.style.padding = '12px';
  element.style.margin = '8px 0';
  element.style.position = 'relative';
  element.style.opacity = '0.9';
  
  // Add deletion label
  const label = document.createElement('div');
  label.className = 'block-label block-label-deleted';
  label.textContent = 'DELETED';
  element.appendChild(label);
  
  return element;
};

const createAddedBlock = (block) => {
  const element = block.element.cloneNode(true);
  
  // Apply green highlighting for added blocks
  element.classList.add('block-added');
  applyBlockDimensions(element, block);
  
  // Add addition styling
  element.style.backgroundColor = '#f0fdf4';
  element.style.border = '3px solid #22c55e';
  element.style.borderRadius = '8px';
  element.style.padding = '12px';
  element.style.margin = '8px 0';
  element.style.position = 'relative';
  
  // Add addition label
  const label = document.createElement('div');
  label.className = 'block-label block-label-added';
  label.textContent = 'ADDED';
  element.appendChild(label);
  
  return element;
};

const createModifiedBlock = (block, side) => {
  const element = block.element.cloneNode(true);
  
  // Apply yellow highlighting for modified blocks
  element.classList.add('block-modified');
  applyBlockDimensions(element, block);
  
  // Add modification styling
  element.style.backgroundColor = '#fffbeb';
  element.style.border = '3px solid #f59e0b';
  element.style.borderRadius = '8px';
  element.style.padding = '12px';
  element.style.margin = '8px 0';
  element.style.position = 'relative';
  
  // Add modification label
  const label = document.createElement('div');
  label.className = 'block-label block-label-modified';
  label.textContent = 'MODIFIED';
  element.appendChild(label);
  
  return element;
};

const createPlaceholder = (block, type) => {
  const placeholder = document.createElement('div');
  
  // Apply exact dimensions
  applyBlockDimensions(placeholder, block);
  
  // Base placeholder styling
  placeholder.style.margin = '8px 0';
  placeholder.style.border = '3px dashed #d1d5db';
  placeholder.style.borderRadius = '8px';
  placeholder.style.display = 'flex';
  placeholder.style.alignItems = 'center';
  placeholder.style.justifyContent = 'center';
  placeholder.style.position = 'relative';
  placeholder.style.opacity = '0.7';
  
  // Type-specific styling
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
  content.style.fontWeight = 'bold';
  
  const icon = type === 'deleted' ? '−' : '+';
  const text = type === 'deleted' ? 'Content Removed' : 'Content Added';
  const blockType = block.type.toUpperCase();
  
  content.innerHTML = `
    <div style="font-size: 20px; margin-bottom: 4px; color: ${type === 'deleted' ? '#ef4444' : '#22c55e'};">${icon}</div>
    <div style="font-size: 12px; font-weight: normal;">${text}</div>
    <div style="font-size: 10px; opacity: 0.8; margin-top: 2px;">(${blockType})</div>
  `;
  
  placeholder.appendChild(content);
  placeholder.classList.add('block-placeholder', `placeholder-${type}`);
  
  return placeholder;
};

const applyBlockDimensions = (element, block) => {
  element.style.width = `${block.width}px`;
  element.style.height = `${block.height}px`;
  element.style.minWidth = `${block.width}px`;
  element.style.minHeight = `${block.height}px`;
  element.style.maxWidth = `${block.width}px`;
  element.style.boxSizing = 'border-box';
};

const escapeHtml = (text) => {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
};