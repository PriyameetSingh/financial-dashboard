/**
 * The Nocturne primitive set.
 *
 * Import from here rather than reaching into individual files, so that the
 * surfaces built on top (S1 landing, S2 onboarding, S3 configurators) have one
 * import site to audit and one place where a primitive can be renamed.
 *
 * Every visual value these components use comes from the token layer, which
 * `NocturneRoot` activates. A component from this set rendered outside a
 * `NocturneRoot` will render unstyled — that is intentional, and it is what
 * keeps the existing signed-off screens free of this design system.
 */
export { default as NocturneRoot } from "./NocturneRoot";
export type { NocturneRootProps } from "./NocturneRoot";

export { default as Button, ButtonLink, IconButton } from "./Button";
export type { ButtonProps, ButtonLinkProps, IconButtonProps, ButtonVariant } from "./Button";

export { default as Tag, StatusTag } from "./Tag";
export type { TagProps, StatusTagProps, TagTone, StatusTone } from "./Tag";

export { default as Card } from "./Card";
export type { CardProps, CardElevation } from "./Card";

export { default as TextField, Field, TextInput, TextArea } from "./Field";
export type { TextFieldProps, FieldProps, TextInputProps, TextAreaProps } from "./Field";

export { default as RadioGroup } from "./RadioGroup";
export type { RadioGroupProps, RadioOption } from "./RadioGroup";

export { default as SegmentedControl } from "./SegmentedControl";
export type { SegmentedControlProps, SegmentOption } from "./SegmentedControl";

export { default as DataTable } from "./DataTable";
export type { DataTableProps, Column, SortDirection } from "./DataTable";

export { default as DialogSurface } from "./Dialog";
export type { DialogSurfaceProps } from "./Dialog";

export { default as Modal } from "./Modal";
export type { ModalProps } from "./Modal";

export { default as StatTile } from "./StatTile";
export type { StatTileProps } from "./StatTile";

export { default as TableScroll } from "./TableScroll";
export type { TableScrollProps } from "./TableScroll";

export { default as Stepper } from "./Stepper";
export type { StepperProps, Step, StepState } from "./Stepper";

export { default as Tabs } from "./Tabs";
export type { TabsProps, TabItem } from "./Tabs";

export { default as ModuleToggle, LockedModuleRow } from "./ModuleToggle";
export type { ModuleToggleProps, LockedModuleRowProps } from "./ModuleToggle";

export { default as FileDrop } from "./FileDrop";
export type { FileDropProps } from "./FileDrop";

export { Toast, InlineAlert, EmptyState, Spinner, LoadingRow } from "./Feedback";
export type { ToastProps, InlineAlertProps, EmptyStateProps, SpinnerProps, LoadingRowProps } from "./Feedback";

export {
  THEME_ROLES,
  PLATFORM_ROLE_DEFAULTS,
  BRAND_SWATCHES,
  themeGround,
  THEME_NAMES,
  DENSITIES,
  isThemeName,
  isDensity,
  isHexColor,
  parseHexColor,
  relativeLuminance,
  contrastRatio,
  formatContrastRatio,
  checkRoleContrast,
  sanitizeRoleValues,
  themeOverrideCss,
} from "./theme";
export type {
  ThemeRole,
  RoleValues,
  ThemeOverrides,
  ThemeName,
  Density,
  Rgb,
  ContrastVerdict,
} from "./theme";
