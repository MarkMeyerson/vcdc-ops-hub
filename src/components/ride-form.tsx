'use client'

import { useActionState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createRide, type RideFormState } from '@/app/ride/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function RideForm({ defaultDate }: { defaultDate: string }) {
  const router = useRouter()
  const [state, action, pending] = useActionState<RideFormState, FormData>(
    createRide,
    { error: null, rideId: null }
  )

  // Straight into the ride once it exists. A leader creating a ride is
  // almost always doing it because riders are already turning up.
  useEffect(() => {
    if (state.rideId) router.push(`/ride/${state.rideId}`)
  }, [state.rideId, router])

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="routeName">Ride name</Label>
        <Input
          id="routeName"
          name="routeName"
          required
          placeholder="Rock Creek Loop"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="rideDate">Date</Label>
        <Input
          id="rideDate"
          name="rideDate"
          type="date"
          required
          defaultValue={defaultDate}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="startLocation">Meeting point</Label>
        <Input
          id="startLocation"
          name="startLocation"
          placeholder="Meridian Hill Park"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="notes">Notes</Label>
        <Input id="notes" name="notes" placeholder="Optional" />
      </div>
      {state.error && <p className="text-sm text-vcdc-red">{state.error}</p>}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Creating...' : 'Create ride'}
      </Button>
    </form>
  )
}
