import { createTheme } from '@mui/material/styles';
import { red, green, blue, grey } from '@mui/material/colors';

// 创建 light 主题
export const lightTheme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#0071e3',
      hover: '#0077ed',
      active: '#006edb',
    },
    secondary: {
      main: grey[700],
    },
    error: {
      main: red[600],
    },
    success: {
      main: green[600],
    },
    background: {
      default: '#ffffff',
      paper: '#ffffff',
    },
    text: {
      primary: '#1d1d1f',
      secondary: '#86868b',
    },
    divider: '#e8e8ed',
    action: {
      hover: 'rgba(0, 113, 227, 0.04)',
      selected: 'rgba(0, 113, 227, 0.08)',
    },
  },
  typography: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Arial, sans-serif',
    h1: {
      fontSize: '40px',
      fontWeight: 700,
      letterSpacing: '-0.02em',
      lineHeight: 1.15,
    },
    h2: {
      fontSize: '22px',
      fontWeight: 600,
    },
    h3: {
      fontSize: '18px',
      fontWeight: 600,
    },
    h4: {
      fontSize: '16px',
      fontWeight: 600,
    },
    body1: {
      fontSize: '14px',
      lineHeight: 1.5,
    },
    body2: {
      fontSize: '13px',
    },
    caption: {
      fontSize: '12px',
    },
  },
  shape: {
    borderRadius: 12,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: '999px',
          fontWeight: 500,
          fontSize: '13px',
          padding: '6px 14px',
        },
        containedPrimary: {
          backgroundColor: '#0071e3',
          '&:hover': {
            backgroundColor: '#0077ed',
          },
        },
        outlinedPrimary: {
          borderColor: '#0071e3',
          color: '#0071e3',
          '&:hover': {
            backgroundColor: 'rgba(0, 113, 227, 0.04)',
          },
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: '8px',
            fontSize: '14px',
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04)',
          border: '1px solid #e8e8ed',
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: '999px',
          fontSize: '13px',
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: 'rgba(255, 255, 255, 0.8)',
          backdropFilter: 'saturate(180%) blur(20px)',
          '-webkit-backdrop-filter': 'saturate(180%) blur(20px)',
          borderBottom: '1px solid rgba(0, 0, 0, 0.06)',
          boxShadow: 'none',
          color: '#1d1d1f',
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 500,
          fontSize: '14px',
          minHeight: '48px',
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderBottom: '1px solid #e8e8ed',
          padding: '10px 14px',
          fontSize: '13px',
          lineHeight: 1.4,
        },
        head: {
          fontWeight: 600,
          fontSize: '12px',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          color: '#6e6e73',
          backgroundColor: '#f8f8fa',
          borderBottom: '2px solid #e8e8ed',
        },
        sizeSmall: {
          padding: '8px 12px',
          fontSize: '13px',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },
  },
});

// 创建 dark 主题
export const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#0a84ff',
      hover: '#409cff',
      active: '#0071e3',
    },
    secondary: {
      main: grey[300],
    },
    error: {
      main: red[500],
    },
    success: {
      main: green[500],
    },
    background: {
      default: '#1c1c1e',
      paper: '#1c1c1e',
    },
    text: {
      primary: '#f5f5f7',
      secondary: '#aeaeb2',
    },
    divider: '#3a3a3c',
    action: {
      hover: 'rgba(10, 132, 255, 0.08)',
      selected: 'rgba(10, 132, 255, 0.12)',
    },
  },
  typography: lightTheme.typography,
  shape: lightTheme.shape,
  components: {
    ...lightTheme.components,
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: 'rgba(28, 28, 30, 0.8)',
          backdropFilter: 'saturate(180%) blur(20px)',
          '-webkit-backdrop-filter': 'saturate(180%) blur(20px)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          boxShadow: 'none',
          color: '#f5f5f7',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.3), 0 1px 2px rgba(0, 0, 0, 0.2)',
          border: '1px solid #3a3a3c',
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderBottom: '1px solid #3a3a3c',
          padding: '10px 14px',
          fontSize: '13px',
          lineHeight: 1.4,
        },
        head: {
          fontWeight: 600,
          fontSize: '12px',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          color: '#98989d',
          backgroundColor: '#2c2c2e',
          borderBottom: '2px solid #3a3a3c',
        },
        sizeSmall: {
          padding: '8px 12px',
          fontSize: '13px',
        },
      },
    },
  },
});

// 涨跌颜色常量
export const stockColors = {
  up: '#ff3b30',      // 红色 - 上涨
  down: '#34c759',    // 绿色 - 下跌
  flat: '#8e8e93',    // 灰色 - 平盘
  blue: '#0071e3',    // 蓝色 - 主色
};

// 暗色模式下的涨跌颜色
export const darkStockColors = {
  up: '#ff453a',
  down: '#30d158',
  flat: '#8e8e93',
  blue: '#0a84ff',
};