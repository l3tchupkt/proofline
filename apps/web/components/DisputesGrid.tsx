'use client';

import {
  AllCommunityModule,
  themeQuartz,
  type ColDef,
  type GridApi,
  type ICellRendererParams
} from 'ag-grid-community';
import { AgGridProvider, AgGridReact } from 'ag-grid-react';
import { ArrowUpRight, Columns3 } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import { getDisputeStatusTone, StatusBadge } from '@proofline/ui';

export interface DisputeGridRow {
  id: string;
  recordOrigin: 'PAYPAL_SANDBOX' | 'DEMO_FIXTURE';
  paypalDisputeId: string;
  paypalTransactionId: string | null;
  reason: string;
  rawStatus: string;
  workflowStatus: string;
  rawLifecycleStage: string | null;
  lifecycleStage: string;
  formattedAmount: string;
  buyerDisplayLabel: string | null;
  sellerResponseDueAt: string | null;
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

function formatDeadline(iso: string | null): {
  text: string;
  title: string;
  urgency: 'expired' | 'soon' | 'normal' | 'none';
} {
  if (!iso) return { text: 'No deadline', title: 'No seller response deadline reported', urgency: 'none' };
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { text: iso, title: iso, urgency: 'none' };
  const diffHours = (date.getTime() - Date.now()) / (1000 * 60 * 60);
  const fullIso = date.toISOString().slice(0, 19).replace('T', ' ') + ' UTC';
  const dateOnly = date.toISOString().slice(0, 10);
  if (diffHours < 0) return { text: `${dateOnly} (EXP)`, title: fullIso, urgency: 'expired' };
  if (diffHours <= 72) return { text: `${dateOnly} (<72h)`, title: fullIso, urgency: 'soon' };
  return { text: dateOnly, title: fullIso, urgency: 'normal' };
}

export function DisputesGrid({
  rows,
  quickFilterText = ''
}: {
  rows: DisputeGridRow[];
  quickFilterText?: string;
}) {
  const gridApiRef = useRef<GridApi<DisputeGridRow> | null>(null);
  const [selectedCount, setSelectedCount] = useState(0);
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const [hiddenCols, setHiddenCols] = useState<Record<string, boolean>>({
    paypalTransactionId: true
  });

  const columnDefs = useMemo<ColDef<DisputeGridRow>[]>(
    () => [
      {
        field: 'paypalDisputeId',
        headerName: 'Dispute ID',
        width: 212,
        hide: Boolean(hiddenCols.paypalDisputeId),
        cellRenderer: (params: ICellRendererParams<DisputeGridRow>) => {
          const row = params.data;
          if (!row) return null;
          return (
            <div className="flex items-center gap-2 h-full">
              <Link
                href={`/disputes/${row.id}`}
                className="font-mono text-[12px] font-medium text-[#1B3B6F] hover:underline whitespace-nowrap"
              >
                {row.paypalDisputeId}
              </Link>
              {row.recordOrigin === 'DEMO_FIXTURE' ? (
                <span className="shrink-0 rounded bg-[#FEF5E4] border border-[#F3D7A2] px-1 py-0.5 text-[10px] font-semibold text-[#9A5B06]">
                  DEMO
                </span>
              ) : null}
            </div>
          );
        }
      },
      {
        field: 'reason',
        headerName: 'Dispute Reason',
        minWidth: 110,
        flex: 1,
        hide: Boolean(hiddenCols.reason),
        cellRenderer: (params: ICellRendererParams<DisputeGridRow>) => (
          <span
            className="font-mono text-[11.5px] text-[#14181F] block truncate"
            title={String(params.value ?? '')}
          >
            {params.value}
          </span>
        )
      },
      {
        field: 'rawStatus',
        headerName: 'PayPal Status',
        width: 244,
        hide: Boolean(hiddenCols.rawStatus),
        cellRenderer: (params: ICellRendererParams<DisputeGridRow>) => {
          const row = params.data;
          if (!row) return null;
          return (
            <div className="flex items-center h-full">
              <StatusBadge
                label={row.rawStatus.replace(/_/g, ' ')}
                tone={getDisputeStatusTone(row.workflowStatus)}
              />
            </div>
          );
        }
      },
      {
        field: 'lifecycleStage',
        headerName: 'Stage',
        width: 84,
        hide: Boolean(hiddenCols.lifecycleStage),
        cellRenderer: (params: ICellRendererParams<DisputeGridRow>) => (
          <span className="font-mono text-[11.5px] text-[#4A5568]">
            {params.data?.rawLifecycleStage ?? params.value}
          </span>
        )
      },
      {
        field: 'formattedAmount',
        headerName: 'Amount',
        width: 116,
        hide: Boolean(hiddenCols.formattedAmount),
        cellRenderer: (params: ICellRendererParams<DisputeGridRow>) => (
          <span className="font-mono text-[12.5px] font-medium tabular-nums text-[#14181F]">
            {params.value}
          </span>
        )
      },
      {
        field: 'sellerResponseDueAt',
        headerName: 'Due (UTC)',
        width: 114,
        hide: Boolean(hiddenCols.sellerResponseDueAt),
        cellRenderer: (params: ICellRendererParams<DisputeGridRow>) => {
          const info = formatDeadline(params.data?.sellerResponseDueAt ?? null);
          const color =
            info.urgency === 'expired'
              ? 'text-[#A82424] font-semibold'
              : info.urgency === 'soon'
                ? 'text-[#9A5B06] font-semibold'
                : 'text-[#4A5568]';
          return (
            <span title={info.title} className={`font-mono text-[11.5px] tabular-nums ${color}`}>
              {info.text}
            </span>
          );
        }
      },
      {
        field: 'paypalTransactionId',
        headerName: 'Transaction Ref',
        width: 155,
        hide: Boolean(hiddenCols.paypalTransactionId),
        cellRenderer: (params: ICellRendererParams<DisputeGridRow>) => (
          <span className="font-mono text-[11.5px] text-[#6B7280]">{params.value ?? '—'}</span>
        )
      },
      {
        field: 'id',
        headerName: 'Case',
        width: 90,
        sortable: false,
        filter: false,
        cellRenderer: (params: ICellRendererParams<DisputeGridRow>) => {
          const row = params.data;
          if (!row) return null;
          return (
            <div className="flex items-center h-full">
              <Link
                href={`/disputes/${row.id}`}
                className="inline-flex items-center gap-1 rounded-[4px] border border-[#C5C0B4] bg-white px-2 py-1 text-[11.5px] font-medium text-[#1B3B6F] hover:bg-[#EEF3FA]"
              >
                <span>Open</span>
                <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
              </Link>
            </div>
          );
        }
      }
    ],
    [hiddenCols]
  );

  const toggleableColumns = [
    { key: 'reason', label: 'Dispute Reason' },
    { key: 'rawStatus', label: 'PayPal Status' },
    { key: 'lifecycleStage', label: 'Stage' },
    { key: 'formattedAmount', label: 'Amount' },
    { key: 'sellerResponseDueAt', label: 'Deadline' },
    { key: 'paypalTransactionId', label: 'Transaction Ref' }
  ];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-[#4A5568]">
        <div>
          {selectedCount > 0
            ? `${selectedCount} dispute(s) selected`
            : `Showing ${rows.length} dispute record(s)`}
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowColumnMenu((prev) => !prev)}
            className="inline-flex items-center gap-1.5 rounded-[4px] border border-[#C5C0B4] bg-white px-2.5 py-1 text-xs font-medium text-[#14181F] hover:bg-[#F7F6F2]"
          >
            <Columns3 className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Columns</span>
          </button>
          {showColumnMenu ? (
            <div className="absolute right-0 z-20 mt-1 w-48 rounded-[4px] border border-[#DFDCD4] bg-white p-2 shadow-md space-y-1">
              {toggleableColumns.map((col) => (
                <label
                  key={col.key}
                  className="flex items-center gap-2 rounded px-2 py-1 text-xs text-[#14181F] hover:bg-[#F7F6F2] cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={!hiddenCols[col.key]}
                    onChange={(e) =>
                      setHiddenCols((prev) => ({
                        ...prev,
                        [col.key]: !e.target.checked
                      }))
                    }
                  />
                  <span>{col.label}</span>
                </label>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="h-[460px] w-full rounded-[4px] border border-[#DFDCD4] overflow-hidden bg-white">
        <AgGridProvider modules={[AllCommunityModule]}>
          <AgGridReact<DisputeGridRow>
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
            paginationPageSize={20}
            rowHeight={44}
            headerHeight={38}
            onGridReady={(evt) => {
              gridApiRef.current = evt.api;
            }}
            onSelectionChanged={(evt) => {
              setSelectedCount(evt.api.getSelectedRows().length);
            }}
          />
        </AgGridProvider>
      </div>
    </div>
  );
}

