'use client';

import {
  AllCommunityModule,
  themeQuartz,
  type ColDef,
  type ICellRendererParams
} from 'ag-grid-community';
import { AgGridProvider, AgGridReact } from 'ag-grid-react';
import { Eye, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { getVerificationTone, StatusBadge } from '@proofline/ui';
import type { InspectableAsset } from './EvidenceInspectorDrawer';

export interface EvidenceGridRow extends InspectableAsset {
  recordOrigin: 'PAYPAL_SANDBOX' | 'DEMO_FIXTURE';
  disputeId: string | null;
}

const PROOFLINE_GRID_THEME = themeQuartz.withParams({
  backgroundColor: '#FFFFFF',
  foregroundColor: '#14181F',
  headerBackgroundColor: '#F0EEE8',
  headerTextColor: '#14181F',
  oddRowBackgroundColor: '#FDFCFA',
  rowHoverColor: '#F4F7FB',
  selectedRowBackgroundColor: '#EEF3FA',
  borderColor: '#DFDCD4',
  accentColor: '#1B3B6F',
  fontSize: 13,
  borderRadius: 4
});

export function EvidenceGrid({
  rows,
  quickFilterText = '',
  onInspect,
  onDelete
}: {
  rows: EvidenceGridRow[];
  quickFilterText?: string;
  onInspect: (asset: EvidenceGridRow) => void;
  onDelete?: (asset: EvidenceGridRow) => void;
}) {
  const [selectedCount, setSelectedCount] = useState(0);

  const columnDefs = useMemo<ColDef<EvidenceGridRow>[]>(
    () => [
      {
        field: 'originalFilename',
        headerName: 'Evidence File',
        minWidth: 185,
        flex: 1,
        cellRenderer: (params: ICellRendererParams<EvidenceGridRow>) => {
          const row = params.data;
          if (!row) return null;
          return (
            <div className="flex items-center gap-2 h-full">
              <button
                type="button"
                onClick={() => onInspect(row)}
                className="font-mono text-[12px] font-medium text-[#1B3B6F] hover:underline truncate text-left"
              >
                {row.originalFilename}
              </button>
              {row.promptInjectionSignals.length > 0 ? (
                <span className="rounded bg-[#FDECEC] border border-[#F5C2C2] px-1.5 py-0.5 text-[10px] font-semibold text-[#A82424]">
                  INJECTION FLAGGED
                </span>
              ) : null}
            </div>
          );
        }
      },
      {
        field: 'status',
        headerName: 'Status',
        width: 125,
        cellRenderer: (params: ICellRendererParams<EvidenceGridRow>) => (
          <div className="flex items-center h-full">
            <StatusBadge
              label={String(params.value ?? '').replace(/_/g, ' ')}
              tone={getVerificationTone(String(params.value ?? ''))}
            />
          </div>
        )
      },
      {
        field: 'sha256Hash',
        headerName: 'SHA-256 Digest',
        width: 130,
        cellRenderer: (params: ICellRendererParams<EvidenceGridRow>) => (
          <span
            title={String(params.value ?? '')}
            className="font-mono text-[11.5px] text-[#4A5568]"
          >
            {String(params.value ?? '').slice(0, 12)}…
          </span>
        )
      },
      {
        field: 'byteSize',
        headerName: 'Size',
        width: 76,
        cellRenderer: (params: ICellRendererParams<EvidenceGridRow>) => (
          <span className="font-mono text-[11.5px] tabular-nums text-[#4A5568]">
            {(Number(params.value ?? 0) / 1024).toFixed(1)} KB
          </span>
        )
      },
      {
        field: 'recordOrigin',
        headerName: 'Origin',
        width: 112,
        cellRenderer: (params: ICellRendererParams<EvidenceGridRow>) => (
          <span className="font-mono text-[11px] text-[#4A5568]">{params.value}</span>
        )
      },
      {
        field: 'receivedAt',
        headerName: 'Receipt (UTC)',
        width: 146,
        cellRenderer: (params: ICellRendererParams<EvidenceGridRow>) => {
          const raw = String(params.value ?? '');
          const shortUtc = raw.slice(0, 16).replace('T', ' ');
          return (
            <span title={raw} className="font-mono text-[11px] tabular-nums text-[#4A5568]">
              {shortUtc}
            </span>
          );
        }
      },
      {
        field: 'id',
        headerName: 'Actions',
        width: 125,
        sortable: false,
        filter: false,
        cellRenderer: (params: ICellRendererParams<EvidenceGridRow>) => {
          const row = params.data;
          if (!row) return null;
          return (
            <div className="flex items-center gap-1.5 h-full">
              <button
                type="button"
                onClick={() => onInspect(row)}
                className="inline-flex items-center gap-1 rounded-[4px] border border-[#C5C0B4] bg-white px-2 py-1 text-[11px] font-medium text-[#1B3B6F] hover:bg-[#EEF3FA]"
              >
                <Eye className="h-3 w-3" aria-hidden="true" />
                <span>Inspect</span>
              </button>
              {onDelete ? (
                <button
                  type="button"
                  onClick={() => onDelete(row)}
                  aria-label={`Delete ${row.originalFilename}`}
                  className="inline-flex items-center justify-center rounded-[4px] border border-[#F5C2C2] bg-white p-1 text-[#A82424] hover:bg-[#FDECEC]"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              ) : null}
            </div>
          );
        }
      }
    ],
    [onInspect, onDelete]
  );

  return (
    <div className="space-y-2">
      <div className="text-xs text-[#4A5568]">
        {selectedCount > 0
          ? `${selectedCount} evidence asset(s) selected`
          : `${rows.length} preserved evidence asset(s)`}
      </div>
      <div className="h-[430px] w-full rounded-[4px] border border-[#DFDCD4] overflow-hidden bg-white">
        <AgGridProvider modules={[AllCommunityModule]}>
          <AgGridReact<EvidenceGridRow>
            theme={PROOFLINE_GRID_THEME}
            rowData={rows}
            columnDefs={columnDefs}
            quickFilterText={quickFilterText}
            defaultColDef={{
              sortable: true,
              filter: true,
              resizable: true
            }}
            rowSelection={{ mode: 'multiRow', checkboxes: true }}
            pagination={true}
            paginationPageSize={15}
            rowHeight={44}
            headerHeight={38}
            onSelectionChanged={(evt) => setSelectedCount(evt.api.getSelectedRows().length)}
          />
        </AgGridProvider>
      </div>
    </div>
  );
}

