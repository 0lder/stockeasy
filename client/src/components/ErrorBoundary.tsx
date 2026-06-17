import { Component, ReactNode } from "react";
import { Box, Typography, Button } from "@mui/material";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutlineOutlined";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "300px",
            gap: 2,
            p: 4,
          }}
        >
          <ErrorOutlineIcon sx={{ fontSize: 48, color: "error.main" }} />
          <Typography variant="h6" color="error">
            页面加载出错
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {this.state.error?.message}
          </Typography>
          <Button variant="outlined" onClick={this.handleReset}>
            重试
          </Button>
        </Box>
      );
    }

    return this.props.children;
  }
}
