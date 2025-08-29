import React, { useState, useCallback } from "react";
import Header from "./components/Header";
import FileUpload from "./components/FileUpload";
import DocumentPreview from "./components/DocumentPreview";
import MiniMap from "./components/MiniMap";
import ComparisonSummary from "./components/ComparisonSummary";
import DetailedReport from "./components/DetailedReport";
import BlockComparisonView from "./components/BlockComparisonView";
import { compareDocuments, compareHtmlDocuments } from "./utils/textComparison";
import {
  exportComparisonResults,
  exportAsHtml,
  exportAsPdf,
} from "./utils/exportUtils";

function App() {
  const [leftDocument, setLeftDocument] = useState(null);
  const [rightDocument, setRightDocument] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [viewMode, setViewMode] = useState("preview");
  const [showDetailed, setShowDetailed] = useState(false);
  const [comparisonMode, setComparisonMode] = useState("standard"); // "standard" or "block"

  const handleDocumentUpload = useCallback((document, position) => {
    if (position === "left") {
      setLeftDocument(document);
    } else {
      setRightDocument(document);
    }
    // Reset comparison when new document is uploaded
    setComparison(null);
    setViewMode("preview");
  }, []);

  const handleCompareDocuments = useCallback(() => {
    console.log("Compare button clicked!");
    console.log("Left document:", leftDocument);
    console.log("Right document:", rightDocument);

    if (leftDocument && rightDocument) {
      console.log("Both documents exist, starting comparison...");
      // Always use original, unmodified HTML content for comparison
      const result = compareHtmlDocuments(
        leftDocument.originalHtmlContent,
        rightDocument.originalHtmlContent
      );
      console.log("Comparison result:", result);
      setComparison(result);
      setViewMode("comparison");
      console.log("Comparison completed, view mode set to comparison");
    } else {
      console.log("Cannot compare - missing documents");
    }
  }, [leftDocument, rightDocument]);

  const handleExportResults = useCallback(() => {
    if (!comparison || !leftDocument || !rightDocument) return;
    exportComparisonResults(comparison, leftDocument, rightDocument);
  }, [comparison, leftDocument, rightDocument]);

  const handleExportHtml = useCallback(() => {
    if (!comparison || !leftDocument || !rightDocument) return;
    exportAsHtml(comparison, leftDocument, rightDocument);
  }, [comparison, leftDocument, rightDocument]);

  const handleExportPdf = useCallback(() => {
    if (!comparison || !leftDocument || !rightDocument) return;
    exportAsPdf(comparison, leftDocument, rightDocument);
  }, [comparison, leftDocument, rightDocument]);

  const clearDocuments = useCallback(() => {
    setLeftDocument(null);
    setRightDocument(null);
    setComparison(null);
  }, []);

  const canCompare = leftDocument && rightDocument;
  const showComparison = comparison && leftDocument && rightDocument;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Upload Section */}
        <div className="mb-8 space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            <FileUpload
              label="Original Document"
              onFileUpload={(doc) => handleDocumentUpload(doc, "left")}
              uploadedFile={leftDocument || undefined}
            />
            <FileUpload
              label="Modified Document"
              onFileUpload={(doc) => handleDocumentUpload(doc, "right")}
              uploadedFile={rightDocument || undefined}
            />
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 justify-center flex-wrap">
            {canCompare && (
              <div className="flex gap-2 bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setViewMode("preview")}
                  className={`px-4 py-2 rounded-md font-medium transition-all duration-200 ${
                    viewMode === "preview"
                      ? "bg-white text-blue-600 shadow-sm"
                      : "text-gray-600 hover:text-gray-800"
                  }`}
                >
                  Preview
                </button>
                <button
                  onClick={() => setViewMode("comparison")}
                  disabled={!comparison}
                  className={`px-4 py-2 rounded-md font-medium transition-all duration-200 ${
                    viewMode === "comparison" && comparison
                      ? "bg-white text-blue-600 shadow-sm"
                      : "text-gray-600 hover:text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                  }`}
                >
                  Comparison
                </button>
                <button
                  onClick={() => setViewMode("blocks")}
                  className={`px-4 py-2 rounded-md font-medium transition-all duration-200 ${
                    viewMode === "blocks"
                      ? "bg-white text-blue-600 shadow-sm"
                      : "text-gray-600 hover:text-gray-800"
                  }`}
                >
                  Block View
                </button>
                {comparison && (
                  <button
                    onClick={() => setShowDetailed((v) => !v)}
                    className={`px-4 py-2 rounded-md font-medium transition-all duration-200 ${
                      showDetailed
                        ? "bg-white text-blue-600 shadow-sm"
                        : "text-gray-600 hover:text-gray-800"
                    }`}
                  >
                    {showDetailed ? "Hide details" : "Show details"}
                  </button>
                )}
              </div>
            )}
            <button
              onClick={handleCompareDocuments}
              disabled={!canCompare}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-sm hover:shadow-md"
            >
              Compare Documents
            </button>
            <button
              onClick={clearDocuments}
              className="px-6 py-3 bg-gray-500 text-white rounded-lg font-medium hover:bg-gray-600 transition-all duration-200 shadow-sm hover:shadow-md"
            >
              Clear All
            </button>
          </div>
        </div>

        {/* Block Comparison View */}
        {leftDocument && rightDocument && viewMode === "blocks" && (
          <BlockComparisonView 
            leftDocument={leftDocument}
            rightDocument={rightDocument}
          />
        )}

        {/* Comparison Results */}
        {showComparison && viewMode === "comparison" && (
          <div className="space-y-6">
            <ComparisonSummary
              comparison={comparison}
              onExportJson={handleExportResults}
              onExportHtml={handleExportHtml}
              onExportPdf={handleExportPdf}
            />

            {/* Document Comparison View */}
            <div className="grid grid-cols-[1fr_60px_1fr] gap-4 items-stretch">
              <DocumentPreview
                document={leftDocument}
                diffs={comparison.leftDiffs}
                title="Original Document"
                containerId="left-preview-container"
              />
              <MiniMap
                leftContainerId="left-preview-container"
                rightContainerId="right-preview-container"
              />
              <DocumentPreview
                document={rightDocument}
                diffs={comparison.rightDiffs}
                title="Modified Document"
                containerId="right-preview-container"
              />
            </div>

            {showDetailed && <DetailedReport report={comparison.detailed} />}

            {/* Legend */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <h4 className="text-sm font-semibold text-gray-700 mb-3">
                Legend
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div className="space-y-3">
                  <h5 className="font-medium text-gray-700">Text Changes</h5>
                  <div className="flex items-center gap-2">
                    <span className="bg-green-200 text-green-800 px-2 py-1 rounded">
                      Added text
                    </span>
                    <span className="text-gray-600">
                      Content added in the modified document
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="bg-red-200 text-red-800 px-2 py-1 rounded line-through">
                      Deleted text
                    </span>
                    <span className="text-gray-600">
                      Content removed from the original document
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="bg-yellow-200 text-yellow-800 px-2 py-1 rounded">
                      Modified text
                    </span>
                    <span className="text-gray-600">
                      Content that was changed between documents
                    </span>
                  </div>
                </div>

                <div className="space-y-3">
                  <h5 className="font-medium text-gray-700">
                    Structural Changes
                  </h5>
                  <div className="flex items-center gap-2">
                    <span className="bg-green-200 text-green-800 px-2 py-1 rounded border-l-4 border-green-500">
                      Table/Image Added
                    </span>
                    <span className="text-gray-600">
                      New tables, charts, or images
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="bg-red-200 text-red-800 px-2 py-1 rounded border-l-4 border-red-500">
                      Table/Image Removed
                    </span>
                    <span className="text-gray-600">
                      Tables, charts, or images that were deleted
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="bg-yellow-200 text-yellow-800 px-2 py-1 rounded border-l-4 border-yellow-500">
                      Table/Image Modified
                    </span>
                    <span className="text-gray-600">
                      Tables, charts, or images that were changed
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Document Preview Mode - Always show original formatting */}
        {leftDocument && rightDocument && viewMode === "preview" && (
          <div className="space-y-6">
            <div className="text-center">
              <h3 className="text-lg font-semibold text-gray-800 mb-2">
                Document Preview
              </h3>
              <p className="text-gray-600">
                View your documents with original formatting preserved
              </p>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <DocumentPreview
                document={leftDocument}
                title="Original Document"
              />
              <DocumentPreview
                document={rightDocument}
                title="Modified Document"
              />
            </div>
          </div>
        )}

        {/* Single Document Preview - Always show original formatting */}
        {((leftDocument && !rightDocument) ||
          (!leftDocument && rightDocument)) && (
          <div className="space-y-6">
            <div className="text-center">
              <h3 className="text-lg font-semibold text-gray-800 mb-2">
                Document Preview
              </h3>
              <p className="text-gray-600">
                Upload another document to enable comparison
              </p>
            </div>

            <div className="max-w-4xl mx-auto">
              <DocumentPreview
                document={leftDocument || rightDocument}
                title={leftDocument ? "Original Document" : "Modified Document"}
              />
            </div>
          </div>
        )}

        {/* Instructions */}
        {!leftDocument && !rightDocument && (
          <div className="text-center py-16">
            <div className="max-w-md mx-auto">
              <div className="mb-6">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg
                    className="w-8 h-8 text-blue-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                </div>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">
                Get Started
              </h3>
              <p className="text-gray-600 mb-6">
                Upload two Word documents to compare them side by side and see
                exactly what changed.
              </p>
              <div className="grid grid-cols-2 gap-4 text-sm text-gray-500">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span>Exact formatting preserved</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  <span>Side-by-side comparison</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                  <span>Supports .docx and .doc</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                  <span>Export results</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;