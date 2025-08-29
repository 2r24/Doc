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
        // Only accept top-level blocks (not nested inside other blocks)
        if (['p', 'table', 'img'].includes(tagName)) {
          // Check if this element is nested inside another block we care about
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
  const rect = element.getBoundingClientRect();
  
  return {
    type: tagName,
    element: element.cloneNode(true),
    originalElement: element,
    content: element.textContent || '',
    html: element.outerHTML,
    width: Math.max(rect.width, element.offsetWidth, 300), // Minimum width
    height: Math.max(rect.height, element.offsetHeight, 20), // Minimum height
    id: generateBlockId(element)
  };
};

const generateBlockId = (element) => {
  const tagName = element.tagName.toLowerCase();
  const content = (element.textContent || '').substring(0, 50);
  const hash = content.split('').reduce((a, b) => {
    a = ((a << 5) - a) + b.charCodeAt(0);
    return a & a;
  }, 0);
  return `${tagName}-${Math.abs(hash)}`;
};

const performBlockComparison = (leftBlocks, rightBlocks) => {
  const leftContainer = document.createElement('div');
  const rightContainer = document.createElement('div');
  
  let summary = { additions: 0, deletions: 0, changes: 0 };

  // Create a mapping of blocks by content similarity
  const { leftMatched, rightMatched, leftUnmatched, rightUnmatched } = matchBlocks(leftBlocks, rightBlocks);

  // Process matched blocks (may have content differences)
  leftMatched.forEach(({ left, right }) => {
    if (left.type === 'p') {
      const { leftElement, rightElement, hasChanges } = compareParagraphs(left, right);
      leftContainer.appendChild(leftElement);
      rightContainer.appendChild(rightElement);
      if (hasChanges) {
        summary.changes++;
      }
    } else {
      // For tables and images, just add them as-is if matched
      leftContainer.appendChild(left.element);
      rightContainer.appendChild(right.element);
    }
  });

  // Process unmatched blocks from left (deletions)
  leftUnmatched.forEach(block => {
    const deletedElement = createDeletedBlock(block);
    const placeholderElement = createPlaceholder(block, 'deleted');
    
    leftContainer.appendChild(deletedElement);
    rightContainer.appendChild(placeholderElement);
    summary.deletions++;
  });

  // Process unmatched blocks from right (additions)
  rightUnmatched.forEach(block => {
    const addedElement = createAddedBlock(block);
    const placeholderElement = createPlaceholder(block, 'added');
    
    leftContainer.appendChild(placeholderElement);
    rightContainer.appendChild(addedElement);
    summary.additions++;
  });

  return {
    leftResult: leftContainer.innerHTML,
    rightResult: rightContainer.innerHTML,
    summary
  };
};

const matchBlocks = (leftBlocks, rightBlocks) => {
  const leftMatched = [];
  const rightMatched = [];
  const leftUnmatched = [...leftBlocks];
  const rightUnmatched = [...rightBlocks];

  // Simple matching algorithm based on content similarity
  leftBlocks.forEach(leftBlock => {
    const bestMatch = findBestMatch(leftBlock, rightUnmatched);
    if (bestMatch.score > 0.3) { // Threshold for considering blocks as matched
      leftMatched.push({ left: leftBlock, right: bestMatch.block });
      
      // Remove from unmatched lists
      const leftIndex = leftUnmatched.findIndex(b => b.id === leftBlock.id);
      const rightIndex = rightUnmatched.findIndex(b => b.id === bestMatch.block.id);
      
      if (leftIndex >= 0) leftUnmatched.splice(leftIndex, 1);
      if (rightIndex >= 0) rightUnmatched.splice(rightIndex, 1);
    }
  });

  return { leftMatched, rightMatched, leftUnmatched, rightUnmatched };
};

const findBestMatch = (block, candidates) => {
  let bestScore = 0;
  let bestBlock = null;

  candidates.forEach(candidate => {
    if (block.type !== candidate.type) return;
    
    const score = calculateSimilarity(block.content, candidate.content);
    if (score > bestScore) {
      bestScore = score;
      bestBlock = candidate;
    }
  });

  return { block: bestBlock, score: bestScore };
};

const calculateSimilarity = (text1, text2) => {
  if (!text1 && !text2) return 1;
  if (!text1 || !text2) return 0;
  
  const diffs = dmp.diff_main(text1, text2);
  const similarity = dmp.diff_levenshtein(diffs);
  const maxLength = Math.max(text1.length, text2.length);
  
  return maxLength > 0 ? 1 - (similarity / maxLength) : 0;
};

const compareParagraphs = (leftBlock, rightBlock) => {
  const leftText = leftBlock.content;
  const rightText = rightBlock.content;

  // Perform word-level diff using diff-match-patch
  const diffs = dmp.diff_main(leftText, rightText);
  dmp.diff_cleanupSemantic(diffs);

  // Create elements with highlighted differences
  const leftElement = leftBlock.element.cloneNode(false);
  const rightElement = rightBlock.element.cloneNode(false);

  let hasChanges = false;
  let leftHtml = '';
  let rightHtml = '';

  diffs.forEach(([operation, text]) => {
    const escapedText = escapeHtml(text);
    
    switch (operation) {
      case 1: // Addition
        rightHtml += `<span class="diff-added">${escapedText}</span>`;
        hasChanges = true;
        break;
      case -1: // Deletion
        leftHtml += `<span class="diff-deleted">${escapedText}</span>`;
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
    leftElement.classList.add('block-modified');
    rightElement.classList.add('block-modified');
  }

  return { leftElement, rightElement, hasChanges };
};

const createDeletedBlock = (block) => {
  const element = block.element.cloneNode(true);
  element.classList.add('block-deleted');
  element.style.backgroundColor = '#fef2f2';
  element.style.border = '2px solid #ef4444';
  element.style.borderRadius = '6px';
  element.style.padding = '8px';
  element.style.margin = '4px 0';
  element.style.minWidth = `${block.width}px`;
  element.style.minHeight = `${block.height}px`;
  element.style.boxSizing = 'border-box';
  
  return element;
};

const createAddedBlock = (block) => {
  const element = block.element.cloneNode(true);
  element.classList.add('block-added');
  element.style.backgroundColor = '#f0fdf4';
  element.style.border = '2px solid #22c55e';
  element.style.borderRadius = '6px';
  element.style.padding = '8px';
  element.style.margin = '4px 0';
  element.style.minWidth = `${block.width}px`;
  element.style.minHeight = `${block.height}px`;
  element.style.boxSizing = 'border-box';
  
  return element;
};

const createPlaceholder = (block, type) => {
  const placeholder = document.createElement('div');
  placeholder.classList.add('block-placeholder', `placeholder-${type}`);
  
  // Set dimensions to match the original block
  placeholder.style.width = `${block.width}px`;
  placeholder.style.height = `${block.height}px`;
  placeholder.style.minWidth = `${block.width}px`;
  placeholder.style.minHeight = `${block.height}px`;
  placeholder.style.margin = '4px 0';
  placeholder.style.border = '2px dashed #d1d5db';
  placeholder.style.borderRadius = '6px';
  placeholder.style.display = 'flex';
  placeholder.style.alignItems = 'center';
  placeholder.style.justifyContent = 'center';
  placeholder.style.backgroundColor = type === 'deleted' ? '#fef2f2' : '#f0fdf4';
  placeholder.style.color = type === 'deleted' ? '#991b1b' : '#166534';
  placeholder.style.fontSize = '14px';
  placeholder.style.fontStyle = 'italic';
  placeholder.style.boxSizing = 'border-box';
  
  const icon = type === 'deleted' ? '−' : '+';
  const text = type === 'deleted' ? 'Content removed' : 'Content added';
  placeholder.innerHTML = `<span>${icon} ${text}</span>`;
  
  return placeholder;
};

const escapeHtml = (text) => {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
};