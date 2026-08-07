import React from 'react'
import { Card, Title3, Text, Button } from '@fluentui/react-components'

interface Props { children: React.ReactNode }
interface State { error: Error | null }

export class AppErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('Uncaught app error:', error, info)
  }

  reset = () => {
    this.setState({ error: null })
    window.location.reload()
  }

  render() {
    if (this.state.error) {
      return (
        <Card>
          <div style={{ padding: 18 }}>
            <Title3>Application error</Title3>
            <Text>Something went wrong rendering the app. The error has been logged to the console.</Text>
            <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', marginTop: 8, color: '#a00' }}>
              {this.state.error?.message}
              {'\n'}{this.state.error?.stack}
            </pre>
            <div style={{ marginTop: 12 }}>
              <Button appearance="primary" onClick={this.reset}>Reload app</Button>
            </div>
          </div>
        </Card>
      )
    }
    return this.props.children
  }
}
