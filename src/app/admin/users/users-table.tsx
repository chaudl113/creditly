"use client";

import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowUpDownIcon, SearchIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export type UserRow = {
  id: string;
  email: string;
  name: string;
  role: "user" | "admin";
  createdAt: string;
  balance: number;
  paidCents: number;
  plan: string | null;
};

const sortable = (label: string) =>
  function SortHeader({ column }: { column: { toggleSorting: (desc: boolean) => void; getIsSorted: () => false | "asc" | "desc" } }) {
    return (
      <Button variant="ghost" size="sm" className="-ml-2" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
        {label} <ArrowUpDownIcon />
      </Button>
    );
  };

const columns: ColumnDef<UserRow>[] = [
  {
    accessorKey: "email",
    header: sortable("User"),
    cell: ({ row }) => (
      <Link href={`/admin/users/${row.original.id}`} className="block hover:underline">
        <div className="font-medium">{row.original.name}</div>
        <div className="text-xs text-muted-foreground">{row.original.email}</div>
      </Link>
    ),
  },
  {
    accessorKey: "plan",
    header: "Plan",
    cell: ({ row }) => (
      <div className="flex gap-1">
        <Badge variant={row.original.plan ? "default" : "secondary"}>{row.original.plan === "pro" ? "Pro" : "Free"}</Badge>
        {row.original.role === "admin" && <Badge variant="outline">admin</Badge>}
        {row.original.email.endsWith("@demo.creditly.test") && <Badge variant="outline">Demo data</Badge>}
      </div>
    ),
  },
  {
    accessorKey: "balance",
    header: sortable("Credits"),
    cell: ({ row }) => <span className="tabular-nums">{row.original.balance.toLocaleString("en-US")}</span>,
  },
  {
    accessorKey: "paidCents",
    header: sortable("Paid"),
    cell: ({ row }) => <span className="tabular-nums">${(row.original.paidCents / 100).toFixed(2)}</span>,
  },
  {
    accessorKey: "createdAt",
    header: sortable("Joined"),
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {new Date(row.original.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}
      </span>
    ),
  },
];

export function UsersTable({ data }: { data: UserRow[] }) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [filter, setFilter] = useState("");
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table is the documented shadcn DataTable engine
  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter: filter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setFilter,
    globalFilterFn: (row, _id, value: string) =>
      `${row.original.email} ${row.original.name}`.toLowerCase().includes(value.toLowerCase()),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 20 } },
  });

  return (
    <div className="space-y-3">
      <div className="relative max-w-sm">
        <SearchIcon className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search name or email…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="pl-8"
          aria-label="Search users"
        />
      </div>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((h) => (
                  <TableHead key={h.id}>{h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}</TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} data-testid="admin-user-row">
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                  No users match.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{table.getFilteredRowModel().rows.length} users</span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
            Previous
          </Button>
          <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
