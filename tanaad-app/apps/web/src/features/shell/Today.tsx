import { useNavigate } from '@tanstack/react-router';
import {
  AlertTriangle,
  Banknote,
  BarChart3,
  Boxes,
  CheckSquare,
  ClipboardCheck,
  Cog,
  Factory,
  FileText,
  PackageCheck,
  Printer,
  Scale,
  ShoppingCart,
  Truck,
  UserPlus,
  Users,
  Wallet,
  Wrench,
} from 'lucide-react';
import { useStore } from '@/data/store';
import { useSite } from '@/app/hooks';
import {
  cashDayFor,
  cashSummary,
  clientBalance,
  currentShiftKind,
  headcount,
  intakeToday,
  lowStockParts,
  machineWall,
  machinesDown,
  openExceptions,
  rosterFor,
} from '@/data/selectors';
import { fmtNum, fmtUGX } from '@/data/format';
import { roleLabel } from '@/config/roles';
import { StatusNotice, TaskRow, type TaskState } from '@/components/simple';
import { en } from '@/i18n/en';

/**
 * Principle 3 & Section 5:
 * "The home screen is a short to-do list. In plain sentences:
 *  'Mark who came to work today', 'Write down what each machine made'.
 *  Each line shows done or not done. Nothing else competes with it."
 *
 * A role never sees another role's screens.
 */
export function Today() {
  const s = useStore();
  const site = useSite();
  const navigate = useNavigate();

  const role = s.session?.role ?? 'supervisor';
  const user = s.users.find((u) => u.id === s.session?.userId);
  const shiftKind = currentShiftKind();

  // Shared live facts for status pills on the home list
  const roster = rosterFor(s, site.id);
  const shiftRec = s.shifts.find(
    (sh) => sh.siteId === site.id && sh.day === s.today && sh.kind === shiftKind,
  );
  const markedCount = shiftRec
    ? s.attendance.filter((a) => a.shiftId === shiftRec.id).length
    : 0;
  const hc = headcount(s, site.id, s.today);

  const wall = machineWall(s, site.id, s.today, shiftKind).filter(
    (m) => m.state !== 'arriving',
  );
  const loggedMachines = wall.filter(
    (m) => m.state === 'ok' || m.state === 'logged' || m.state === 'below',
  ).length;
  const unloggedMachines = wall.filter((m) => m.state === 'not_logged').length;

  const addedWorkersToday = s.people.filter(
    (p) => p.homeSiteId === site.id && p.joinedOn === s.today,
  ).length;

  const labelsToday = s.labels.filter(
    (l) => l.siteId === site.id && l.day === s.today,
  ).length;

  const cd = cashDayFor(s, site.id, s.today);
  const cs = cd ? cashSummary(s, cd.id) : undefined;
  const ordersAwaitingCash = s.orders.filter(
    (o) => o.siteId === site.id && o.status === 'awaiting_cash',
  ).length;
  const moneyOutLines = cs
    ? cs.entries.filter((e) => e.direction === 'out').length
    : 0;

  const ordersToLoad = s.orders.filter(
    (o) => o.siteId === site.id && (o.status === 'approved' || o.status === 'picking'),
  ).length;
  const dispatchesToday = s.dispatches.filter(
    (d) => d.siteId === site.id && d.createdAt.startsWith(s.today),
  );
  const heldAtGate = dispatchesToday.filter((d) => d.gateStatus === 'hold').length;
  const pendingAtGate = dispatchesToday.filter((d) => d.gateStatus === 'pending').length;

  const countsToday = s.stockCounts.filter(
    (c) => c.siteId === site.id && c.day === s.today,
  ).length;
  const lowParts = lowStockParts(s, site.id);
  const downMachines = machinesDown(s, site.id);

  const siteClients = s.clients.filter((c) =>
    site.id === 'mats' ? true : c.channel === 'local',
  );
  const owingClients = siteClients.filter(
    (c) => clientBalance(s, c.id).balance > 0,
  ).length;
  const siteOrders = s.orders.filter((o) => o.siteId === site.id);
  const unpaidInvoices = s.invoices.filter((inv) => {
    const ord = siteOrders.find((o) => o.id === inv.orderId);
    return ord && ord.status !== 'paid';
  }).length;

  const exceptions = openExceptions(s, site.id);
  const intakes = intakeToday(s, s.today);

  const go = (subpath: string, search?: Record<string, string>) => {
    navigate({
      to: `/s/${site.id}/${subpath}` as never,
      search: search as never,
    });
  };

  interface HomeItem {
    title: string;
    description: string;
    statusText: string;
    state: TaskState;
    icon: typeof Users;
    onClick: () => void;
  }

  let items: HomeItem[] = [];
  let roleSubtitle: string = en.home.supervisorSub;

  if (role === 'supervisor') {
    roleSubtitle = en.home.supervisorSub;
    const allMarked = roster.length > 0 && markedCount >= roster.length;
    const allMachinesLogged = wall.length > 0 && unloggedMachines === 0;
    items = [
      {
        title: en.home.tasks.whoCameToday,
        description: en.home.tasks.whoCameTodayDesc,
        statusText: allMarked
          ? `Done · ${markedCount} marked`
          : `${markedCount} of ${roster.length} marked`,
        state: allMarked ? 'done' : 'attention',
        icon: Users,
        onClick: () => go('people/attendance'),
      },
      {
        title: en.home.tasks.whatMachinesMade,
        description: en.home.tasks.whatMachinesMadeDesc,
        statusText: allMachinesLogged
          ? `Done · all ${wall.length} written down`
          : `${loggedMachines} of ${wall.length} machines written down`,
        state: allMachinesLogged ? 'done' : 'attention',
        icon: Factory,
        onClick: () => go('production/wall'),
      },
      {
        title: en.home.tasks.addNewWorker,
        description: en.home.tasks.addNewWorkerDesc,
        statusText:
          addedWorkersToday > 0
            ? `Done · ${addedWorkersToday} added today`
            : 'Ready when needed',
        state: addedWorkersToday > 0 ? 'done' : 'todo',
        icon: UserPlus,
        onClick: () => go('people/signup'),
      },
      {
        title: en.home.tasks.printSticker,
        description:
          site.id === 'bags'
            ? 'Print the 6-field roll sticker for an extruded film roll'
            : en.home.tasks.printStickerDesc,
        statusText:
          labelsToday > 0
            ? `Done · ${labelsToday} printed today`
            : 'Tap to print sticker',
        state: labelsToday > 0 ? 'done' : 'todo',
        icon: Printer,
        onClick: () =>
          go(site.id === 'bags' ? 'production/rolls' : 'production/labels'),
      },
    ];
  } else if (role === 'cashier') {
    roleSubtitle = en.home.cashierSub;
    const moneyInDone = ordersAwaitingCash === 0 && (cs?.sales ?? 0) + (cs?.receipts ?? 0) > 0;
    const isClosed = cd?.status === 'closed';
    items = [
      {
        title: en.home.tasks.moneyIn,
        description: en.home.tasks.moneyInDesc,
        statusText:
          ordersAwaitingCash > 0
            ? `${ordersAwaitingCash} order${ordersAwaitingCash > 1 ? 's' : ''} waiting for cash`
            : moneyInDone
              ? `Done · ${fmtUGX((cs?.sales ?? 0) + (cs?.receipts ?? 0))} in`
              : 'Not done yet',
        state:
          ordersAwaitingCash > 0
            ? 'attention'
            : moneyInDone
              ? 'done'
              : 'todo',
        icon: Banknote,
        onClick: () => go('cash', { mode: 'in' }),
      },
      {
        title: en.home.tasks.moneyOut,
        description: en.home.tasks.moneyOutDesc,
        statusText:
          moneyOutLines > 0
            ? `Done · ${moneyOutLines} payment${moneyOutLines > 1 ? 's' : ''} written down`
            : 'No payments written today',
        state: moneyOutLines > 0 ? 'done' : 'todo',
        icon: Wallet,
        onClick: () => go('cash/expense'),
      },
      {
        title: en.home.tasks.closeDay,
        description: en.home.tasks.closeDayDesc,
        statusText: isClosed ? 'Done · day closed and signed' : 'Not counted yet',
        state: isClosed ? 'done' : 'attention',
        icon: CheckSquare,
        onClick: () => go('cash', { mode: 'close' }),
      },
    ];
  } else if (role === 'storekeeper') {
    roleSubtitle = en.home.storekeeperSub;
    items = [
      {
        title: en.home.tasks.loadLorry,
        description: en.home.tasks.loadLorryDesc,
        statusText:
          ordersToLoad > 0
            ? `${ordersToLoad} order${ordersToLoad > 1 ? 's' : ''} ready to load`
            : dispatchesToday.length > 0
              ? `Done · ${dispatchesToday.length} loaded today`
              : 'No lorry waiting',
        state:
          ordersToLoad > 0
            ? 'attention'
            : dispatchesToday.length > 0
              ? 'done'
              : 'todo',
        icon: Truck,
        onClick: () => go('stock/dispatch'),
      },
      {
        title: en.home.tasks.receiveGoods,
        description: en.home.tasks.receiveGoodsDesc,
        statusText: 'Check note against scale',
        state: 'todo',
        icon: PackageCheck,
        onClick: () =>
          go(site.id === 'recycling' ? 'production/intake' : 'stock/receive'),
      },
      {
        title: en.home.tasks.countStore,
        description: en.home.tasks.countStoreDesc,
        statusText:
          countsToday > 0
            ? `Done · ${countsToday} product${countsToday > 1 ? 's' : ''} counted today`
            : 'Not counted today',
        state: countsToday > 0 ? 'done' : 'attention',
        icon: ClipboardCheck,
        onClick: () => go('stock/count'),
      },
      {
        title: en.home.tasks.giveSparePart,
        description: en.home.tasks.giveSparePartDesc,
        statusText:
          lowParts.length > 0
            ? `${lowParts.length} part${lowParts.length > 1 ? 's' : ''} low in stock`
            : 'Store locked · PIN ready',
        state: lowParts.length > 0 ? 'attention' : 'todo',
        icon: Wrench,
        onClick: () => go('stock/spares'),
      },
    ];
  } else if (role === 'gate') {
    roleSubtitle = en.home.gateSub;
    items = [
      {
        title: en.home.tasks.weighLorryOut,
        description: en.home.tasks.weighLorryOutDesc,
        statusText:
          heldAtGate > 0
            ? `${heldAtGate} lorry held at gate`
            : pendingAtGate > 0
              ? `${pendingAtGate} lorry waiting to weigh`
              : dispatchesToday.length > 0
                ? `Done · ${dispatchesToday.length} weighed today`
                : 'Ready to weigh lorry',
        state:
          heldAtGate > 0 || pendingAtGate > 0
            ? 'attention'
            : dispatchesToday.length > 0
              ? 'done'
              : 'todo',
        icon: Truck,
        onClick: () => go('stock/dispatch'),
      },
      {
        title: en.home.tasks.weighDeliveryIn,
        description:
          site.id === 'recycling'
            ? 'Weigh collector scrap, take deductions and see what we pay'
            : en.home.tasks.weighDeliveryInDesc,
        statusText:
          site.id === 'recycling' && intakes.length > 0
            ? `Done · ${intakes.length} weighed today`
            : 'Scale ready',
        state: site.id === 'recycling' && intakes.length > 0 ? 'done' : 'todo',
        icon: Scale,
        onClick: () =>
          go(site.id === 'recycling' ? 'production/intake' : 'stock/receive'),
      },
    ];
  } else if (role === 'mechanic') {
    roleSubtitle = en.home.mechanicSub;
    items = [
      {
        title: en.home.tasks.takeSparePart,
        description: en.home.tasks.takeSparePartDesc,
        statusText: 'Enter part, machine and PIN',
        state: 'todo',
        icon: Wrench,
        onClick: () => go('stock/spares'),
      },
      {
        title: en.home.tasks.reportBrokenMachine,
        description: en.home.tasks.reportBrokenMachineDesc,
        statusText:
          downMachines.length > 0
            ? `${downMachines.length} machine${downMachines.length > 1 ? 's' : ''} down now`
            : 'Done · all machines running',
        state: downMachines.length > 0 ? 'attention' : 'done',
        icon: AlertTriangle,
        onClick: () => go('stock/maintenance'),
      },
    ];
  } else if (role === 'sales') {
    roleSubtitle = en.home.salesSub;
    items = [
      {
        title: en.home.tasks.newOrder,
        description: en.home.tasks.newOrderDesc,
        statusText: `${siteOrders.length} orders on record`,
        state: 'todo',
        icon: ShoppingCart,
        onClick: () => go('sales/orders'),
      },
      {
        title: en.home.tasks.whoOwesUs,
        description: en.home.tasks.whoOwesUsDesc,
        statusText:
          owingClients > 0
            ? `${owingClients} customer${owingClients > 1 ? 's' : ''} owe money`
            : 'Done · no unpaid balance',
        state: owingClients > 0 ? 'attention' : 'done',
        icon: Users,
        onClick: () => go('sales/clients'),
      },
      {
        title: en.home.tasks.sendInvoice,
        description: en.home.tasks.sendInvoiceDesc,
        statusText:
          unpaidInvoices > 0
            ? `${unpaidInvoices} unpaid invoice${unpaidInvoices > 1 ? 's' : ''}`
            : 'Done · all invoices paid',
        state: unpaidInvoices > 0 ? 'attention' : 'done',
        icon: FileText,
        onClick: () => go('sales/invoices'),
      },
    ];
  } else {
    // Site manager
    roleSubtitle = en.home.siteManagerSub;
    items = [
      {
        title: en.home.tasks.todayAtFactory,
        description: en.home.tasks.todayAtFactoryDesc,
        statusText: `${hc.total} people came today`,
        state: 'done',
        icon: Factory,
        onClick: () => go('dashboard'),
      },
      {
        title: en.home.tasks.thingsWaitingManager,
        description: en.home.tasks.thingsWaitingManagerDesc,
        statusText:
          exceptions.length > 0
            ? `${exceptions.length} waiting for you`
            : 'Done · nothing waiting',
        state: exceptions.length > 0 ? 'attention' : 'done',
        icon: AlertTriangle,
        onClick: () => go('dashboard', { tab: 'waiting' }),
      },
      {
        title: en.home.tasks.people,
        description: en.home.tasks.peopleDesc,
        statusText: `${roster.length} workers`,
        state: 'todo',
        icon: Users,
        onClick: () => go('people/registry'),
      },
      {
        title: en.home.tasks.reports,
        description: en.home.tasks.reportsDesc,
        statusText: 'View numbers',
        state: 'todo',
        icon: BarChart3,
        onClick: () => go('reports'),
      },
      {
        title: en.home.tasks.settings,
        description: en.home.tasks.settingsDesc,
        statusText: 'Products, machines, lists',
        state: 'todo',
        icon: Cog,
        onClick: () => go('settings'),
      },
    ];
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Calm greeting header */}
      <div className="paper-sheet p-5">
        <div className="t-sm font-semibold text-[var(--text-2)]">
          {site.name} · {roleLabel(role)}
          {user ? ` · ${user.name}` : ''}
        </div>
        <h1 className="t-title text-[var(--text)] mt-0.5">{en.home.title}</h1>
        <p className="t-base text-[var(--text-2)] mt-1">{roleSubtitle}</p>
      </div>

      {/* Unconfirmed process note if present on this site (Rule 7) */}
      {site.toBeConfirmed && (
        <StatusNotice tone="warn" title={en.app.toBeConfirmed}>
          {site.toBeConfirmed}
        </StatusNotice>
      )}

      {/* Short to-do list (2 to 5 items) */}
      <div className="flex flex-col gap-3" role="list" aria-label="Today's tasks">
        {items.map((item, idx) => (
          <TaskRow
            key={item.title}
            index={idx + 1}
            icon={item.icon}
            title={item.title}
            description={item.description}
            statusText={item.statusText}
            state={item.state}
            onClick={item.onClick}
          />
        ))}
      </div>
    </div>
  );
}
