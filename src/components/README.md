# Component Structure

This directory contains reusable UI components extracted from the main ProspectingApp to improve code organization and maintainability.

## Directory Structure

```
components/
├── buttons/
│   ├── TabButton.jsx           # Navigation tab button with active state
│   ├── PrimaryButton.jsx       # Main action button with loading state
│   ├── SaveButton.jsx          # Save/bookmark button with toggle state
│   └── ListItemButton.jsx      # List item button with title/subtitle
├── cards/
│   ├── SearchForm.jsx          # Search and filter form
│   ├── SavedAccountsHeader.jsx # Saved accounts header with filter
│   ├── ForecastCard.jsx        # Monthly forecast display card
│   ├── VolumeAdjuster.jsx      # Volume type selector with revenue breakdown
│   ├── AIIntelPanel.jsx        # AI intelligence lookup panel
│   └── ActivityLog.jsx         # Notes and GPV tier management
└── inputs/
    ├── SearchInput.jsx         # Search input with icon
    ├── FilterInput.jsx         # Filter input field
    └── TextArea.jsx            # Text area input

utils/
└── formatters.js               # Utility functions (formatCurrency, getFullAddress, etc.)
```

## Component Usage

### Buttons

- **TabButton**: Used for navigation tabs with active/inactive states and optional badge
- **PrimaryButton**: Main action buttons with loading spinner support
- **SaveButton**: Toggle button for saving/bookmarking items
- **ListItemButton**: Displays list items with title, subtitle, and chevron

### Cards

- **SearchForm**: Complete search form with conditional city filter
- **SavedAccountsHeader**: Portfolio header with search/filter capability
- **ForecastCard**: Displays monthly revenue forecast
- **VolumeAdjuster**: Venue type selector with food/alcohol revenue estimates
- **AIIntelPanel**: AI-powered intelligence lookup with quick prompts
- **ActivityLog**: Notes management with GPV tiers and active opportunity tracking

### Inputs

- **SearchInput**: Input field with optional icon (Search, MapPin, etc.)
- **FilterInput**: Smaller filter input for list filtering
- **TextArea**: Reusable textarea component

## Benefits

1. **Reduced Bloat**: Main App.jsx file is now much cleaner and easier to navigate
2. **Reusability**: Components can be reused across different parts of the app
3. **Maintainability**: Changes to UI elements are isolated to specific component files
4. **Testing**: Individual components can be tested in isolation
5. **Consistency**: Ensures UI consistency across the application
