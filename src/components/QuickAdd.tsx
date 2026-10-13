import { useNavigate } from 'react-router-dom'
import {
  Button, Menu, MenuTrigger, MenuPopover, MenuList, MenuItem,
} from '@fluentui/react-components'
import { AddRegular } from '@fluentui/react-icons'

export function QuickAdd() {
  const navigate = useNavigate()

  return (
    <Menu>
      <MenuTrigger disableButtonEnhancement>
        <Button appearance="primary" icon={<AddRegular />} size="small">Quick Add</Button>
      </MenuTrigger>
      <MenuPopover>
        <MenuList>
          <MenuItem onClick={() => navigate('/invoices?new=1')}>New Invoice</MenuItem>
          <MenuItem onClick={() => navigate('/properties?new=1')}>New Property</MenuItem>
          <MenuItem onClick={() => navigate('/contacts?new=1')}>New Contact</MenuItem>
        </MenuList>
      </MenuPopover>
    </Menu>
  )
}
