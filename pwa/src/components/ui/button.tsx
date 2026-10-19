import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/** Bouton shadcn/ui, cibles tactiles d'au moins 44 px. */
export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold transition-[transform,background-color,color,box-shadow] duration-150 active:scale-[.97] disabled:pointer-events-none disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-primary/40 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-[0_10px_24px_-12px_var(--primary)] hover:brightness-110',
        secondary: 'bg-muted text-foreground hover:bg-border',
        outline: 'border border-border bg-card text-foreground hover:bg-muted',
        ghost: 'text-foreground hover:bg-muted',
        dock: 'bg-dock-foreground text-zinc-900',
      },
      size: {
        default: 'h-11 px-5 text-sm',
        sm: 'h-9 px-3.5 text-[13px]',
        icon: 'size-11',
        'icon-sm': 'size-10',
        'icon-lg': 'size-16',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> { asChild?: boolean }

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : 'button';
  return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
});
Button.displayName = 'Button';
