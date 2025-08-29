import React, { useEffect, useRef, useState } from 'react';
import { compareDocumentBlocks } from '../utils/blockComparison';

const BlockComparisonView = ({ leftDocument, rightDocument }) => {
  const [comparisonResult, setComparisonResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const leftContainerRef = useRef(null);
  const rightContainerRef = useRef(null);

  useEffect(() => {
    if (!leftDocument || !rightDocument) {
      setComparisonResult(null);
      return;
    }

    setIsLoading(true);
    
    // Perform comparison with a small delay to show loading state
    const timer = setTimeout(() => {
      try {
        const result = compareDocumentBlocks(
          leftDocument.originalHtmlContent,
          rightDocument.originalHtmlContent
        );
        setComparisonResult(result);
      } catch (error) {
        console.error('Comparison failed:', error);
        setComparisonResult(null);
      } finally {
        setIsLoading(false);
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [leftDocument, rightDocument]);

  // Synchronized scrolling
  useEffect(() => {
    const leftContainer = leftContainerRef.current;
    const rightContainer = rightContainerRef.current;
    
    if (!leftContainer || !rightContainer) return;

    let isScrolling = false;

    const handleScroll = (sourceContainer, targetContainer) => (e) => {
      if (isScrolling) return;
      
      isScrolling = true;
      
      const sourceMaxScroll = Math.max(1, sourceContainer.scrollHeight - sourceContainer.clientHeight);
      const targetMaxScroll = Math.max(1, targetContainer.scrollHeight - targetContainer.clientHeight);
      
      const scrollRatio = sourceContainer.scrollTop / sourceMaxScroll;
      const targetScrollTop = Math.round(targetMaxScroll * scrollRatio);
      
      targetContainer.scrollTop = targetScrollTop;
      
      setTimeout(() => {
        isScrolling = false;
      }, 50);
    };

    const leftScrollHandler = handleScroll(leftContainer, rightContainer);
    const rightScrollHandler = handleScroll(rightContainer, leftContainer);

    leftContainer.addEventListener('scroll', leftScrollHandler, { passive: true });
    rightContainer.addEventListener('scroll', rightScrollHandler, { passive: true });

    return () => {
      leftContainer.removeEventListener('scroll', leftScrollHandler);
      rightContainer.removeEventListener('scroll', rightScrollHandler);
    };
  }, [comparisonResult]);

  if (!leftDocument || !rightDocument) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-600">Upload both documents to see block-level comparison</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="text-center py-16">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Analyzing document blocks...</p>
      </div>
    );
  }

  if (!comparisonResult) {
    return (
      <div className="text-center py-16">
        <p className="text-red-600">Failed to compare documents. Please try again.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Block-Level Comparison Summary</h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center p-4 bg-green-50 rounded-lg border border-green-200">
            <div className="text-2xl font-bold text-green-800">{comparisonResult.summary.additions}</div>
            <div className="text-sm text-green-600">Blocks Added</div>
          </div>
          <div className="text-center p-4 bg-red-50 rounded-lg border border-red-200">
            <div className="text-2xl font-bold text-red-800">{comparisonResult.summary.deletions}</div>
            <div className="text-sm text-red-600">Blocks Removed</div>
          </div>
          <div className="text-center p-4 bg-blue-50 rounded-lg border border-blue-200">
            <div className="text-2xl font-bold text-blue-800">{comparisonResult.summary.changes}</div>
            <div className="text-sm text-blue-600">Total Changes</div>
          </div>
        </div>
      </div>

      {/* Document Comparison */}
      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 border-b border-gray-200">
            <h4 className="font-semibold text-gray-800">Original Document</h4>
            <p className="text-sm text-gray-600 truncate">{leftDocument.name}</p>
          </div>
          <div 
            ref={leftContainerRef}
            className="block-comparison-container p-6 h-96 overflow-y-auto"
            style={{ scrollBehavior: 'smooth' }}
          >
            <div 
              className="word-document-preview"
              dangerouslySetInnerHTML={{ __html: comparisonResult.leftHtml }}
            />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 border-b border-gray-200">
            <h4 className="font-semibold text-gray-800">Modified Document</h4>
            <p className="text-sm text-gray-600 truncate">{rightDocument.name}</p>
          </div>
          <div 
            ref={rightContainerRef}
            className="block-comparison-container p-6 h-96 overflow-y-auto"
            style={{ scrollBehavior: 'smooth' }}
          >
            <div 
              className="word-document-preview"
              dangerouslySetInnerHTML={{ __html: comparisonResult.rightHtml }}
            />
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h4 className="text-sm font-semibold text-gray-700 mb-4">Legend</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <h5 className="font-medium text-gray-700">Block Changes</h5>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 bg-green-100 border-2 border-green-500 rounded"></div>
                <span>Added blocks (new content)</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 bg-red-100 border-2 border-red-500 rounded"></div>
                <span>Removed blocks (deleted content)</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 border-2 border-dashed border-gray-400 rounded"></div>
                <span>Placeholder (preserves layout)</span>
              </div>
            </div>
          </div>
          
          <div className="space-y-3">
            <h5 className="font-medium text-gray-700">Text Changes</h5>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-3">
                <span className="bg-green-200 text-green-800 px-2 py-1 rounded text-xs">added</span>
                <span>Words added within paragraphs</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="bg-red-200 text-red-800 px-2 py-1 rounded text-xs line-through">deleted</span>
                <span>Words removed from paragraphs</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BlockComparisonView;