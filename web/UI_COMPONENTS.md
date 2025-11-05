# VendPark UI Components

This application is built with **shadcn/ui** components and follows modern React best practices with a dark theme.

## 🎨 Design System

### Color Scheme
The application uses a carefully crafted dark theme with excellent contrast and visual hierarchy:

- **Background**: Deep navy blue (`224 71% 4%`)
- **Primary**: Bright blue (`217.2 91.2% 59.8%`) for interactive elements
- **Chart Colors**: 5 distinct colors for data visualization
- **Semantic Colors**: Success (emerald), Destructive (red), Warning, etc.

### Typography
- **Font Family**: System font stack (SF Pro, Segoe UI, Roboto)
- **Headings**: Bold, tracking-tight
- **Body**: Regular weight with optimized line height

## 📦 shadcn/ui Components Used

### Core Components

1. **Button** (`components/ui/button.tsx`)
   - Variants: default, secondary, outline, ghost, destructive, link
   - Sizes: default, sm, lg, icon
   - Supports icons from lucide-react

2. **Card** (`components/ui/card.tsx`)
   - CardHeader
   - CardTitle
   - CardDescription
   - CardContent
   - Used for all dashboard sections

3. **Input** (`components/ui/input.tsx`)
   - Standard form input with focus states
   - Integrates with Label component

4. **Label** (`components/ui/label.tsx`)
   - Accessible form labels
   - Supports required fields

5. **Select** (`components/ui/select.tsx`)
   - Native HTML select styled with shadcn patterns
   - Consistent with design system

6. **Textarea** (`components/ui/textarea.tsx`)
   - Multi-line text input
   - Used for JSON permissions editing

7. **Table** (`components/ui/table.tsx`)
   - THead, TBody, TR, TH, TD components
   - Responsive with horizontal scroll
   - Used in RBAC page

8. **Tabs** (`components/ui/tabs.tsx`)
   - Simple tab navigation
   - Active state highlighting

### Feedback Components

9. **Alert** (`components/ui/alert.tsx`)
   - AlertTitle
   - AlertDescription
   - Variants: default, destructive
   - Used for important notifications

10. **Badge** (`components/ui/badge.tsx`)
    - Small status indicators
    - Variants: default, secondary, destructive, outline
    - Used for user counts, statuses

11. **Skeleton** (`components/ui/skeleton.tsx`)
    - Loading placeholders
    - Smooth pulse animation
    - Matches component shapes

### Layout Components

12. **Separator** (`components/ui/separator.tsx`)
    - Horizontal/vertical dividers
    - Subtle visual breaks

13. **Progress** (`components/ui/progress.tsx`)
    - Progress bars
    - Used for occupancy rates

## 🎯 Icons

Using **lucide-react** for consistent, beautiful icons:
- `Building2` - Garages
- `LayoutDashboard` - Dashboard
- `Shield` - Security/RBAC
- `Users` - Subscriptions
- `DollarSign` - Revenue
- `TrendingUp` - Growth metrics
- `Car` - Parking
- `CreditCard` - Payments
- `ArrowLeft`, `ArrowRight` - Navigation
- `Plus` - Add actions
- `UserCog` - Admin actions
- `Check`, `AlertCircle` - Status indicators

## 📊 Charts

Using **Recharts** with custom theming:
- LineChart - Occupancy trends
- BarChart - Revenue comparison
- PieChart - Capacity usage

All charts use HSL color variables from the theme for consistency.

## 🎭 Pages

### Global Admin
- Overview of all garages
- Revenue metrics and charts
- Quick access to individual garages
- Stat cards with icons

### Garage Admin
- Detailed garage metrics
- Hourly occupancy charts
- P&L summary
- Real-time parking status
- Capacity visualization

### RBAC
- User management
- Permission assignment
- Impersonation controls
- Interactive permissions editor

## 🎨 Custom Styling

### CSS Variables
All colors use CSS custom properties with HSL values:
```css
--background: 224 71% 4%;
--foreground: 213 31% 91%;
--primary: 217.2 91.2% 59.8%;
```

### Utility Classes
Extensive use of Tailwind utility classes:
- `space-y-*` for vertical spacing
- `grid gap-*` for layouts
- `text-muted-foreground` for secondary text
- `hover:border-primary/50` for interactions

### Animations
- Smooth transitions on hover
- Pulse animation for skeletons
- Progress bar transitions

## 🚀 Best Practices

1. **Accessibility**: Proper labels, ARIA attributes, keyboard navigation
2. **Responsive**: Mobile-first with breakpoint utilities
3. **Performance**: Code splitting, optimized re-renders
4. **Type Safety**: Full TypeScript coverage
5. **Consistency**: Unified component API across the app
6. **Dark Theme**: Optimized for reduced eye strain

## 📝 Adding New Components

To add a new shadcn component:

```bash
# From the web directory
npx shadcn-ui@latest add [component-name]
```

This will automatically:
- Download the component
- Place it in `components/ui/`
- Use your theme variables
- Include TypeScript types

## 🎯 Component Guidelines

1. **Always use shadcn components** - Don't create custom styled divs
2. **Use Icons** - Enhance UX with lucide-react icons
3. **Provide Feedback** - Loading states, errors, success messages
4. **Be Descriptive** - Use CardDescription for context
5. **Mobile First** - Test on small screens
6. **Dark Theme** - All new components should look great in dark mode

