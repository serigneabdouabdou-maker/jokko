/**
 * Icônes de Jokko : UNE seule bibliothèque (Lucide), un seul endroit.
 * Tout le site importe ses icônes d'ici, par leur SENS (« vente », « caisse », « stockBas »…), pas par leur dessin :
 * on peut changer un dessin partout en une ligne.
 *
 * Règles (identiques partout) :
 * - trait 1,75 px, coins et extrémités arrondis (style Lucide), contour seulement (jamais de plein) ;
 * - tailles en jetons : sm 16 px, md 20 px (par défaut), lg 24 px, xl 32 px ;
 * - couleur = currentColor (elle suit le texte ou un jeton CSS --j-icon-*), jamais de couleur en dur ;
 * - décorative (à côté d'un texte visible) : cachée aux lecteurs d'écran ; sinon donner `label`.
 */
import type { CSSProperties, SVGProps } from "react";
import {
  Wrench,
  Scissors,
  Sparkles,
  School,
  MapPinned,
  Mail,
  Headphones,
  ExternalLink,
  CodeXml,
  AlertCircle,
  ArrowDown,
  ArrowLeftRight,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  AudioLines,
  Banknote,
  BookUser,
  ChartColumn,
  Check,
  ChevronDown,
  ChevronUp,
  CircleCheck,
  ClipboardPaste,
  CloudCheck,
  CloudOff,
  Coins,
  Download,
  FileSpreadsheet,
  Gem,
  Languages,
  Lightbulb,
  Lock,
  LogOut,
  Minus,
  type LucideIcon,
  MapPin,
  MessageCircle,
  Mic,
  NotebookPen,
  Package,
  PackageX,
  Pause,
  Play,
  Plus,
  QrCode,
  RadioTower,
  Receipt,
  RefreshCw,
  ScanBarcode,
  ScrollText,
  Send,
  Settings,
  Share2,
  ShoppingBag,
  Smartphone,
  Square,
  Store,
  Tags,
  Trash2,
  TriangleAlert,
  Undo2,
  UserRound,
  Users,
  Wallet,
  X,
  Camera,
} from "lucide-react";

/** Le sens de chaque icône → son dessin Lucide. */
export const ICONS = {
  // Commerce
  boutique: Store,
  vente: ShoppingBag,
  caisse: Banknote,
  especes: Coins,
  depense: Wallet,
  stock: Package,
  stockBas: PackageX,
  client: BookUser,
  credit: NotebookPen,
  dette: NotebookPen,
  mobileMoney: Smartphone,
  facture: Receipt,
  etiquette: Tags,
  scanner: ScanBarcode,
  qr: QrCode,
  rapport: ChartColumn,
  conseil: Lightbulb,
  journal: ScrollText,
  equipe: Users,
  vendeur: UserRound,
  distance: RadioTower,
  offre: Gem,
  reglages: Settings,
  langue: Languages,
  position: MapPin,
  // CFC (page d'accueil)
  numerique: CodeXml,
  ia: Sparkles,
  reparation: Wrench,
  couture: Scissors,
  accessoire: Headphones,
  ecole: School,
  carte: MapPinned,
  lien: ExternalLink,
  email: Mail,
  // Voix
  micro: Mic,
  voix: AudioLines,
  stop: Square,
  lecture: Play,
  pause: Pause,
  // États
  alerte: TriangleAlert,
  erreur: AlertCircle,
  ok: CircleCheck,
  coche: Check,
  sauvegarde: CloudCheck,
  horsLigne: CloudOff,
  verrou: Lock,
  // Actions
  envoyer: ArrowUp,
  suivant: ArrowRight,
  descendre: ArrowDown,
  monter: ArrowUp,
  ouvrir: ArrowUpRight,
  echange: ArrowLeftRight,
  partager: Share2,
  whatsapp: MessageCircle,
  photo: Camera,
  telecharger: Download,
  ajouter: Plus,
  moins: Minus,
  supprimer: Trash2,
  annuler: Undo2,
  fermer: X,
  rafraichir: RefreshCw,
  coller: ClipboardPaste,
  tableur: FileSpreadsheet,
  deconnexion: LogOut,
  message: Send,
  ouvert: ChevronDown,
  ferme: ChevronUp,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

/** Icône de chaque moyen de paiement. */
export const PAYMENT_ICON: Record<"especes" | "wave" | "om" | "credit", IconName> = { especes: "especes", wave: "mobileMoney", om: "mobileMoney", credit: "credit" };

/** Jetons de taille (px), les mêmes que --j-icon-sm/md/lg/xl dans styles.css. */
export const ICON_SIZES = { sm: 16, md: 20, lg: 24, xl: 32 } as const;
export const ICON_STROKE = 1.75;

type IconProps = Omit<SVGProps<SVGSVGElement>, "ref" | "name"> & {
  name: IconName;
  size?: keyof typeof ICON_SIZES;
  /** Donner un texte si l'icône est seule et porte un sens ; sinon elle est décorative (cachée aux lecteurs d'écran). */
  label?: string;
  className?: string;
  style?: CSSProperties;
};

export function Icon({ name, size = "md", label, className, ...rest }: IconProps) {
  const Glyph = ICONS[name];
  const px = ICON_SIZES[size];
  return (
    <Glyph
      size={px}
      strokeWidth={ICON_STROKE}
      absoluteStrokeWidth={false}
      className={`jk-icon jk-icon-${size}${className ? ` ${className}` : ""}`}
      focusable="false"
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
      {...rest}
    />
  );
}

/**
 * Petit message d'état avec son icône. Un message qui commence par « ✓ » (ancien format) est affiché en succès,
 * sans le caractère : l'icône le remplace.
 */
export function Notice({ text, tone, className = "note" }: { text: string; tone?: "ok" | "erreur" | "alerte"; className?: string }) {
  const ok = tone === "ok" || text.startsWith("✓");
  const shown = text.replace(/^✓\s*/, "");
  const name: IconName | null = ok ? "ok" : tone === "erreur" ? "erreur" : tone === "alerte" ? "alerte" : null;
  return (
    <p className={`${className} jk-notice`} data-tone={ok ? "ok" : tone}>
      {name && <Icon name={name} size="sm" />}
      <span>{shown}</span>
    </p>
  );
}
